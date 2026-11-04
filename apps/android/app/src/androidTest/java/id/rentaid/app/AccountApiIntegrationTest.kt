package id.rentaid.app

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.UUID

class AccountApiIntegrationTest {
    @Test
    fun registrationProfileRestartAndRevocation() =
        runBlocking {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            val store = KeystoreSessionStore(context, "secure_session_api_test")
            store.clear()
            val email = "android-${UUID.randomUUID()}@example.test"
            val password = "Phase19-test-password!"
            try {
                val initial = ApiAccountRepository(BuildConfig.API_BASE_URL, store)
                initial.register(email, password, "Android Test", "0812345678")
                assertEquals(email, initial.login(email, password).email)
                assertEquals("Nama Baru", initial.update("Nama Baru", "0819876543").name)
                val oldToken = requireNotNull(store.read())
                val restarted = ApiAccountRepository(BuildConfig.API_BASE_URL, KeystoreSessionStore(context, "secure_session_api_test"))
                assertEquals("Nama Baru", restarted.restore()?.name)
                assertEquals("0819876543", restarted.restore()?.phone)
                restarted.logout()
                assertNull(store.read())
                store.write(oldToken)
                assertThrows(SessionExpired::class.java) {
                    runBlocking { ApiAccountRepository(BuildConfig.API_BASE_URL, store).restore() }
                }
                assertNull(store.read())
            } finally {
                store.clear()
            }
        }
}
