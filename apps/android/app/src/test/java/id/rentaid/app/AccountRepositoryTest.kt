package id.rentaid.app

import id.rentaid.app.account.data.ApiAccountRepository
import id.rentaid.app.account.data.SessionExpired
import id.rentaid.app.core.security.SessionStore
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class AccountRepositoryTest {
    private class MemoryStore : SessionStore {
        var value: String? = null

        override fun read() = value

        override fun write(token: String) {
            value = token
        }

        override fun clear() {
            value = null
        }
    }

    private val profile =
        """{"id":"e947cb7e-5df8-4ea7-8e77-cab2ee13c289","email":"user@example.test",""" +
            """"name":"User","phone":"08123","status":"active"}"""
    private val session =
        """{"user":{"id":"e947cb7e-5df8-4ea7-8e77-cab2ee13c289","email":"user@example.test",""" +
            """"role":"user"},"expiresAt":"2030-01-01T00:00:00Z","token":"test-token"}"""

    @Test
    fun loginRestoreProfileAndLogoutUseBearer() =
        runBlocking {
            MockWebServer().use { server ->
                val store = MemoryStore()
                server.enqueue(MockResponse().setBody(session))
                server.enqueue(MockResponse().setBody(profile))
                val url = server.url("/").toString().trimEnd('/')
                val repository = ApiAccountRepository(url, store)
                assertEquals("User", repository.login("user@example.test", "secret").name)
                assertEquals("test-token", store.value)
                val login = server.takeRequest()
                assertEquals("/api/v1/auth/login", login.path)
                assertNull(login.getHeader("Authorization"))
                assertEquals("Bearer test-token", server.takeRequest().getHeader("Authorization"))
                server.enqueue(MockResponse().setBody(profile))
                val reopened = ApiAccountRepository(url, store)
                assertEquals("User", reopened.restore()?.name)
                assertEquals("Bearer test-token", server.takeRequest().getHeader("Authorization"))
                server.enqueue(MockResponse().setBody("""{"status":"ok"}"""))
                reopened.logout()
                assertEquals("Bearer test-token", server.takeRequest().getHeader("Authorization"))
                assertNull(store.value)
            }
        }

    @Test
    fun revokedSessionIsClearedButOfflineSessionIsRetained() =
        runBlocking {
            val store = MemoryStore().apply { value = "test-token" }
            val server = MockWebServer()
            server.start()
            val url = server.url("/").toString().trimEnd('/')
            server.enqueue(MockResponse().setResponseCode(401).setBody("""{"code":"unauthorized","message":"Sesi tidak berlaku"}"""))
            assertThrows(SessionExpired::class.java) { runBlocking { ApiAccountRepository(url, store).restore() } }
            assertNull(store.value)
            store.value = "test-token"
            server.shutdown()
            assertThrows(java.io.IOException::class.java) { runBlocking { ApiAccountRepository(url, store).restore() } }
            assertEquals("test-token", store.value)
        }

    @Test
    fun logoutFailureRetainsTokenForRetry() =
        runBlocking {
            val store = MemoryStore().apply { value = "test-token" }
            val server = MockWebServer()
            server.start()
            val url = server.url("/").toString().trimEnd('/')
            server.enqueue(MockResponse().setBody(profile))
            val repository = ApiAccountRepository(url, store)
            repository.restore()
            server.shutdown()
            assertThrows(java.io.IOException::class.java) { runBlocking { repository.logout() } }
            assertEquals("test-token", store.value)
        }
}
