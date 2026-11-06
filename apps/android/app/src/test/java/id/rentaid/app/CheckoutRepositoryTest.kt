package id.rentaid.app

import id.rentaid.app.checkout.data.ApiCheckoutGateway
import id.rentaid.app.checkout.data.CheckoutAttempt
import id.rentaid.app.checkout.data.CheckoutResult
import id.rentaid.app.core.security.SessionStore
import id.rentaid.client.models.CheckoutInput
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

class CheckoutRepositoryTest {
    private val id = UUID.fromString("e947cb7e-5df8-4ea7-8e77-cab2ee13c289")

    private class MemoryStore : SessionStore {
        override fun read() = "token-test"

        override fun write(token: String) = Unit

        override fun clear() = Unit
    }

    @Test fun generatedClientSendsBearerKeyAndReadsChangedQuote() =
        runBlocking {
            MockWebServer().use { server ->
                val date = "Wed, 04 Nov 2026 00:00:00 GMT"
                val session = """{"user":{"id":"$id","email":"user@example.test","role":"user"},"expiresAt":"2026-11-18T00:00:00Z"}"""
                val quote =
                    """{"productId":"$id","startDate":"2026-11-05","endDate":"2026-11-06",""" +
                        """"days":2,"quantity":1,"dailyPrice":20000,"available":1,"total":40000}"""
                server.enqueue(MockResponse().setHeader("Date", date).setBody(session))
                server.enqueue(
                    MockResponse().setResponseCode(409).setBody("""{"code":"quote_changed","message":"Berubah","quote":$quote}"""),
                )
                val gateway = ApiCheckoutGateway(server.url("/").toString().trimEnd('/'), MemoryStore())
                assertEquals(Instant.parse("2026-11-04T00:00:00Z"), gateway.session().serverTime)
                assertEquals("Bearer token-test", server.takeRequest().getHeader("Authorization"))
                val input = CheckoutInput(id, LocalDate.parse("2026-11-05"), LocalDate.parse("2026-11-06"), 1, 30000, 2)
                val attempt = CheckoutAttempt(id, "same-key", input, 1, gateway.origin)
                val result = gateway.checkout(attempt)
                assertTrue(result is CheckoutResult.Changed)
                assertEquals(40000L, (result as CheckoutResult.Changed).quote.total)
                val request = server.takeRequest()
                assertEquals("same-key", request.getHeader("Idempotency-Key"))
                assertEquals("Bearer token-test", request.getHeader("Authorization"))
                assertTrue(request.body.readUtf8().contains("\"expectedAvailable\":2"))
            }
        }
}
