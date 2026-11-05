package id.rentaid.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.platform.app.InstrumentationRegistry
import id.rentaid.client.apis.DefaultApi
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class CheckoutUiIntegrationTest {
    @get:Rule val compose = createComposeRule()

    @Test fun quoteToStockHold() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val session = KeystoreSessionStore(context, "phase21_ui_session")
        val attempts = EncryptedCheckoutAttemptStore(KeystoreSessionStore(context, "phase21_ui_pending", clearOnInvalid = false))
        session.clear()
        attempts.clear()
        val api = DefaultApi(BuildConfig.API_BASE_URL)
        val catalog = ApiCatalogRepository(api)
        val account = ApiAccountRepository(BuildConfig.API_BASE_URL, session)
        val gateway = ApiCheckoutGateway(BuildConfig.API_BASE_URL, session)
        val id =
            runBlocking {
                val email = "checkout-ui-${UUID.randomUUID()}@example.test"
                account.register(email, "Phase21-test-password!", "Penyewa Test", "0812345678")
                account.login(email, "Phase21-test-password!")
                catalog.products(1, "Kamera Mirrorless", null).single().id
            }
        val start = LocalDate.now(ZoneId.of("Asia/Jakarta")).plusDays(2 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
        try {
            compose.setContent { RentaidApp(ApiConnectionRepository(api), account, catalog, checkout = gateway, attempts = attempts) }
            compose.onNodeWithText("Lihat katalog").performClick()
            compose.onNodeWithText("Cari produk").performTextInput("Kamera Mirrorless")
            compose.onNodeWithText("Cari", substring = false).performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Kamera Mirrorless")).fetchSemanticsNodes().size > 1 }
            compose.onNodeWithTag("product_$id").performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Rencanakan sewa")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Rencanakan sewa").performScrollTo().performClick()
            compose.onNodeWithText("Tanggal mulai (YYYY-MM-DD)").performTextInput(start.toString())
            compose.onNodeWithText("Tanggal selesai (YYYY-MM-DD)").performTextInput(start.plusDays(1).toString())
            compose.onNodeWithText("Lihat penawaran").performScrollTo().performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Ringkasan penawaran")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Total Rp300.000").performScrollTo().assertIsDisplayed()
            compose.onNodeWithText("Lanjut ke checkout").performScrollTo().performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Pesanan RNT-", substring = true)).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Status: Menunggu pembayaran").assertIsDisplayed()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Sisa hold:", substring = true)).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Sisa hold:", substring = true).assertIsDisplayed()
            compose.onNodeWithText("Simulasikan berhasil").performScrollTo().performClick()
            compose.waitUntil(15_000) {
                compose.onAllNodes(hasText("Status: Pembayaran berhasil, pesanan terkonfirmasi")).fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithText("Kembali").performScrollTo().performClick()
            compose.onNodeWithText("Kembali").performScrollTo().performClick()
            compose.onNodeWithText("Kembali").performScrollTo().performClick()
            compose.onNodeWithText("Lanjutkan pesanan").performScrollTo().performClick()
            compose.waitUntil(15_000) {
                compose.onAllNodes(hasText("Status: Pembayaran berhasil, pesanan terkonfirmasi")).fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithText("Selesai").performScrollTo().performClick()
        } finally {
            attempts.clear()
            session.clear()
        }
    }
}
