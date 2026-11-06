package id.rentaid.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.platform.app.InstrumentationRegistry
import id.rentaid.app.account.data.ApiAccountRepository
import id.rentaid.app.connection.data.ApiConnectionRepository
import id.rentaid.app.core.security.KeystoreSessionStore
import id.rentaid.app.navigation.RentaidApp
import id.rentaid.client.apis.DefaultApi
import org.junit.Rule
import org.junit.Test
import java.util.UUID

class AccountUiIntegrationTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun userCanRegisterLoginEditAndLogout() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = KeystoreSessionStore(context, "secure_session_ui_test")
        store.clear()
        val email = "ui-${UUID.randomUUID()}@example.test"
        try {
            compose.setContent {
                RentaidApp(
                    ApiConnectionRepository(DefaultApi(BuildConfig.API_BASE_URL)),
                    ApiAccountRepository(BuildConfig.API_BASE_URL, store),
                )
            }
            compose.onNodeWithText("Akun dan profil").performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Buat akun")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Buat akun").performClick()
            compose.onNodeWithText("Nama").performTextInput("Pengguna Android")
            compose.onNodeWithText("Nomor telepon").performTextInput("0812345678")
            compose.onNodeWithText("Email").performTextInput(email)
            compose.onNodeWithText("Kata sandi").performTextInput("Phase19-test-password!")
            compose.onNodeWithText("Daftar").performClick()
            compose.waitUntil(
                15_000,
            ) { compose.onAllNodes(hasText("Pendaftaran berhasil. Silakan masuk.")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Kata sandi").performTextInput("Phase19-test-password!")
            compose.onNodeWithText("Masuk", substring = false).performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Simpan profil")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText(email).assertIsDisplayed()
            compose.onNodeWithText("Simpan profil").performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Profil berhasil disimpan.")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Keluar").performClick()
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Anda telah keluar.")).fetchSemanticsNodes().isNotEmpty() }
        } finally {
            store.clear()
        }
    }
}
