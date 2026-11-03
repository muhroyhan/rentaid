package id.rentaid.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test

class ConnectionScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun unavailableApiShowsRetry() {
        var retried = false
        compose.setContent {
            ConnectionScreen(ConnectionState.Unavailable, onRetry = { retried = true }, onBack = {})
        }
        compose.onNodeWithText("API tidak dapat dihubungi. Periksa koneksi dan coba lagi.").assertIsDisplayed()
        compose.onNodeWithText("Coba lagi").performClick()
        assert(retried)
    }
}
