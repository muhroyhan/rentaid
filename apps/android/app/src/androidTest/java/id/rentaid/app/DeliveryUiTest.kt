package id.rentaid.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.platform.app.InstrumentationRegistry
import com.google.gson.JsonObject
import id.rentaid.app.account.data.ApiAccountRepository
import id.rentaid.app.catalog.data.ApiCatalogRepository
import id.rentaid.app.checkout.data.ApiCheckoutGateway
import id.rentaid.app.checkout.data.EncryptedCheckoutAttemptStore
import id.rentaid.app.connection.data.ApiConnectionRepository
import id.rentaid.app.core.security.KeystoreSessionStore
import id.rentaid.app.navigation.RentaidApp
import id.rentaid.app.orders.data.ApiOrderRepository
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.models.Order
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class DeliveryUiTest {
    @get:Rule val compose = createComposeRule()

    private fun waitText(
        value: String,
        substring: Boolean = false,
    ) {
        compose.waitUntil(20_000) { compose.onAllNodes(hasText(value, substring = substring)).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun click(value: String) = compose.onNodeWithText(value, substring = false).performScrollTo().performClick()

    private fun refreshUntil(value: String) {
        val deadline = System.nanoTime() + 90_000_000_000L
        while (System.nanoTime() < deadline) {
            if (compose.onAllNodes(hasText(value)).fetchSemanticsNodes().isNotEmpty()) return
            compose.waitUntil(20_000) { compose.onAllNodes(hasText("Muat ulang") and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
            click("Muat ulang")
            Thread.sleep(300)
        }
        fail("Timed out waiting for $value")
    }

    @Test fun renterCompletesDemoWithVendorAndAdmin() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("phase25") == "true")
        val name = requireNotNull(args.getString("phase25Name"))
        val control = requireNotNull(args.getString("phase25Control"))
        val token = requireNotNull(args.getString("phase25Token"))
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val session = KeystoreSessionStore(context, "phase25_ui_session")
        val attempts = EncryptedCheckoutAttemptStore(KeystoreSessionStore(context, "phase25_ui_pending", clearOnInvalid = false))
        session.clear()
        attempts.clear()
        val api = DefaultApi(BuildConfig.API_BASE_URL)
        val account = ApiAccountRepository(BuildConfig.API_BASE_URL, session)
        val catalog = ApiCatalogRepository(api)
        val gateway = ApiCheckoutGateway(BuildConfig.API_BASE_URL, session)
        val orders = ApiOrderRepository(BuildConfig.API_BASE_URL, session)
        val product =
            runBlocking {
                val email = "delivery-${UUID.randomUUID()}@example.test"
                account.register(email, "Phase25-test-password!", name, "0812345678")
                account.login(email, "Phase25-test-password!")
                catalog.products(1, "Kamera Mirrorless", null).single().id
            }
        val today = LocalDate.now(ZoneId.of("Asia/Jakarta")).toString()
        val http = OkHttpClient()

        fun send(
            stage: String,
            vararg fields: Pair<String, String>,
        ) {
            val data =
                JsonObject().apply {
                    addProperty("stage", stage)
                    fields.forEach { (key, value) -> addProperty(key, value) }
                }
            val request =
                Request.Builder().url(control).header("X-Test-Token", token)
                    .post(data.toString().toRequestBody("application/json".toMediaType())).build()
            http.newCall(request).execute().use { check(it.code == 200) }
        }

        fun openProduct() {
            click("Lihat katalog")
            compose.onNodeWithText("Cari produk").performTextInput("Kamera Mirrorless")
            click("Cari")
            compose.waitUntil(20_000) { compose.onAllNodes(hasTestTag("product_$product")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("product_$product").performClick()
            waitText("Rencanakan sewa")
        }

        fun checkout(): UUID {
            click("Rencanakan sewa")
            compose.onNodeWithText("Tanggal mulai (YYYY-MM-DD)").performTextInput(today)
            compose.onNodeWithText("Tanggal selesai (YYYY-MM-DD)").performTextInput(today)
            click("Lihat penawaran")
            waitText("Ringkasan penawaran")
            click("Lanjut ke checkout")
            waitText("Pesanan RNT-", substring = true)
            return requireNotNull(attempts.read()?.orderId)
        }

        fun productToHome() {
            click("Kembali")
            click("Kembali")
        }

        fun openOrder(id: UUID) {
            click("Pesanan saya")
            compose.waitUntil(20_000) { compose.onAllNodes(hasTestTag("order_$id")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("order_$id").performClick()
            waitText("Detail pesanan")
        }

        fun orderToHome() {
            click("Kembali")
            click("Kembali")
        }

        fun cancelOrder() {
            click("Batalkan pesanan")
            compose.onNodeWithText("Ya, batalkan").performClick()
            waitText("Status: Dibatalkan")
        }

        try {
            compose.setContent {
                RentaidApp(
                    ApiConnectionRepository(api),
                    account,
                    catalog,
                    checkout = gateway,
                    attempts = attempts,
                    orders = orders,
                )
            }
            openProduct()
            val completed = checkout()
            click("Simulasikan berhasil")
            waitText("Status: Pembayaran berhasil, pesanan terkonfirmasi")
            click("Selesai")
            productToHome()
            openOrder(completed)
            waitText("Status: Terkonfirmasi")
            val code = runBlocking { orders.detail(completed).order.orderCode }
            send("confirmed", "id" to completed.toString(), "code" to code)
            refreshUntil("Status: Sedang disewa")
            send("renting")
            refreshUntil("Status: Selesai")
            compose.onNodeWithText("Status: Selesai").performScrollTo().assertIsDisplayed()
            send("completed")
            orderToHome()

            openProduct()
            val failed = checkout()
            click("Simulasikan gagal")
            waitText("Status: Pembayaran gagal")
            assertEquals(Order.Status.payment_failed, runBlocking { orders.detail(failed).order.status })
            click("Selesai")

            val unpaid = checkout()
            click("Kembali")
            productToHome()
            openOrder(unpaid)
            waitText("Status: Menunggu pembayaran")
            cancelOrder()
            assertNull(runBlocking { orders.detail(unpaid).refund })
            orderToHome()
            click("Lanjutkan pesanan")
            waitText("Status: Pesanan dibatalkan")
            click("Selesai")

            openProduct()
            val refunded = checkout()
            click("Simulasikan berhasil")
            waitText("Status: Pembayaran berhasil, pesanan terkonfirmasi")
            click("Selesai")
            productToHome()
            openOrder(refunded)
            waitText("Status: Terkonfirmasi")
            cancelOrder()
            val refundDetail = runBlocking { orders.detail(refunded) }
            assertNotNull(refundDetail.refund)
            assertEquals(refundDetail.order.total, refundDetail.refund?.amount)
            compose.onNodeWithText("Refund simulasi").performScrollTo().assertIsDisplayed()
            send(
                "finished",
                "completed" to completed.toString(),
                "failed" to failed.toString(),
                "unpaid" to unpaid.toString(),
                "refunded" to refunded.toString(),
            )
        } finally {
            attempts.clear()
            session.clear()
        }
    }
}
