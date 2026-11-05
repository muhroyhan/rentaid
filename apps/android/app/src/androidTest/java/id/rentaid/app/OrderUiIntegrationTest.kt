package id.rentaid.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.platform.app.InstrumentationRegistry
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.models.CheckoutInput
import id.rentaid.client.models.PaymentInput
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class OrderUiIntegrationTest {
    @get:Rule val compose = createComposeRule()

    @Test fun listDetailCancelAndRefund() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = KeystoreSessionStore(context, "phase23_ui_session")
        store.clear()
        val api = DefaultApi(BuildConfig.API_BASE_URL)
        val accounts = ApiAccountRepository(BuildConfig.API_BASE_URL, store)
        val gateway = ApiCheckoutGateway(BuildConfig.API_BASE_URL, store)
        val orders = ApiOrderRepository(BuildConfig.API_BASE_URL, store)
        val id =
            runBlocking {
                val email = "phase23-ui-${UUID.randomUUID()}@example.test"
                accounts.register(email, "Phase23-test-password!", "Penyewa Uji", "0812345678")
                accounts.login(email, "Phase23-test-password!")
                val owner = gateway.session()
                val product = ApiCatalogRepository(api).products(1, "Kamera Mirrorless", null).single()
                val date =
                    LocalDate.now(
                        ZoneId.of("Asia/Jakarta"),
                    ).plusDays(10 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
                val quote = gateway.quote(product.id, date, date, 1)
                val input = CheckoutInput(product.id, date, date, 1, quote.total, quote.available)
                val attempt =
                    CheckoutAttempt(owner.userId, UUID.randomUUID().toString(), input, owner.serverTime.toEpochMilli(), gateway.origin)
                val order = (gateway.checkout(attempt) as CheckoutResult.Created).order.order
                gateway.pay(
                    order.id,
                    PaymentAttempt(UUID.randomUUID().toString(), PaymentInput.Outcome.succeeded, owner.serverTime.toEpochMilli()),
                )
                order.id
            }
        try {
            compose.setContent { RentaidApp(ApiConnectionRepository(api), accounts, orders = orders) }
            compose.onNodeWithText("Pesanan saya").performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Terkonfirmasi")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("order_$id").performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Status: Terkonfirmasi")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Batalkan pesanan").performScrollTo().performClick()
            compose.onNodeWithText("Ya, batalkan").performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Status: Dibatalkan")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Refund simulasi").performScrollTo().assertIsDisplayed()
            assert(compose.onAllNodes(hasText("Rp150.000", substring = true)).fetchSemanticsNodes().size >= 2)
            compose.onNodeWithText("Muat ulang").performScrollTo().performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Status: Dibatalkan")).fetchSemanticsNodes().isNotEmpty() }
        } finally {
            store.clear()
        }
    }
}
