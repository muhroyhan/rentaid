package id.rentaid.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import id.rentaid.app.connection.data.ApiConnectionRepository
import id.rentaid.app.connection.data.ConnectionRepository
import id.rentaid.app.connection.presentation.ConnectionScreen
import id.rentaid.app.connection.presentation.ConnectionState
import id.rentaid.app.navigation.RentaidApp
import id.rentaid.client.apis.DefaultApi
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.io.IOException

class ConnectionScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun unreachableApiShowsErrorWithoutCrashing() {
        compose.setContent { RentaidApp(ApiConnectionRepository(DefaultApi("http://127.0.0.1:1"))) }
        compose.onNodeWithText("Periksa koneksi").performClick()
        compose.waitUntil(10_000) {
            compose.onAllNodes(androidx.compose.ui.test.hasText("Coba lagi")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("API tidak dapat dihubungi. Periksa koneksi dan coba lagi.").assertIsDisplayed()
    }

    @Test
    fun unavailableApiShowsRetry() {
        var retried = false
        compose.setContent {
            ConnectionScreen(ConnectionState.Unavailable, onRetry = { retried = true }, onBack = {})
        }
        compose.onNodeWithText("API tidak dapat dihubungi. Periksa koneksi dan coba lagi.").assertIsDisplayed()
        compose.onNodeWithText("Coba lagi").performClick()
        assertTrue(retried)
    }

    @Test
    fun failedConnectionCanBeRetriedFromNavigation() {
        var available = false
        val repository =
            object : ConnectionRepository {
                override suspend fun check(): String {
                    if (!available) throw IOException("offline")
                    return "ok"
                }
            }
        compose.setContent { RentaidApp(repository) }
        compose.onNodeWithText("Periksa koneksi").performClick()
        compose.waitUntil(5_000) {
            compose.onAllNodes(androidx.compose.ui.test.hasText("Coba lagi")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("API tidak dapat dihubungi. Periksa koneksi dan coba lagi.").assertIsDisplayed()
        available = true
        compose.onNodeWithText("Coba lagi").performClick()
        compose.waitUntil(5_000) {
            compose.onAllNodes(androidx.compose.ui.test.hasText("Terhubung ke API. Status: ok")).fetchSemanticsNodes().isNotEmpty()
        }
    }
}
