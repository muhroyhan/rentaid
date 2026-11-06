package id.rentaid.app

import id.rentaid.app.connection.data.ApiConnectionRepository
import id.rentaid.client.apis.DefaultApi
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException

class ApiConnectionRepositoryTest {
    @Test
    fun readsHealthFromApi() =
        runTest {
            MockWebServer().use { server ->
                server.enqueue(MockResponse().setBody("""{"status":"ok"}"""))
                val repository = ApiConnectionRepository(DefaultApi(server.url("/").toString().trimEnd('/')))
                assertEquals("ok", repository.check())
                assertEquals("/api/v1/health", server.takeRequest().path)
            }
        }

    @Test
    fun unavailableApiFailsWithoutHanging() {
        val server = MockWebServer()
        server.start()
        val url = server.url("/").toString().trimEnd('/')
        server.shutdown()
        assertThrows(IOException::class.java) {
            kotlinx.coroutines.runBlocking { ApiConnectionRepository(DefaultApi(url)).check() }
        }
    }
}
