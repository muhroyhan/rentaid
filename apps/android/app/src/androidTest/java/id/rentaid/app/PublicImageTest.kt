package id.rentaid.app

import android.util.Base64
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import id.rentaid.app.core.presentation.PublicImage
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import java.util.UUID

class PublicImageTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun invalidImageShowsFallback() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setHeader("Content-Type", "image/png").setBody("invalid image"))
            val baseUrl = server.url("/").toString()
            val id = UUID.randomUUID()
            compose.setContent { PublicImage(baseUrl, id, "Foto uji") }
            compose.waitUntil(15_000) { compose.onAllNodes(hasText("Gambar tidak tersedia")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Gambar tidak tersedia").assertIsDisplayed()
        }
    }

    @Test
    fun imageFromApiIsDisplayed() {
        val image =
            Base64.decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                Base64.DEFAULT,
            )
        MockWebServer().use { server ->
            val id = UUID.randomUUID()
            server.enqueue(MockResponse().setHeader("Content-Type", "image/png").setBody(Buffer().write(image)))
            val baseUrl = server.url("/").toString()
            compose.setContent { PublicImage(baseUrl, id, "Foto uji") }
            compose.waitUntil(15_000) { compose.onAllNodes(hasContentDescription("Foto uji")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithContentDescription("Foto uji").assertIsDisplayed()
            assertEquals("/api/v1/media/$id", server.takeRequest().path)
        }
    }
}
