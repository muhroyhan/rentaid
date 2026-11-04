package id.rentaid.app

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.UUID

class SessionProcessTest {
    @Test
    fun prepareSession() =
        runBlocking {
            assumeTrue(InstrumentationRegistry.getArguments().getString("sessionPhase") == "prepare")
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            val store = KeystoreSessionStore(context, "secure_session_process_test")
            store.clear()
            val repository = ApiAccountRepository(BuildConfig.API_BASE_URL, store)
            val email = "process-${UUID.randomUUID()}@example.test"
            repository.register(email, "Phase19-test-password!", "Proses Test", "0812345678")
            repository.login(email, "Phase19-test-password!")
            assertNotNull(store.read())
        }

    @Test
    fun restoreSession() =
        runBlocking {
            assumeTrue(InstrumentationRegistry.getArguments().getString("sessionPhase") == "restore")
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            val store = KeystoreSessionStore(context, "secure_session_process_test")
            val repository = ApiAccountRepository(BuildConfig.API_BASE_URL, store)
            try {
                assertNotNull(repository.restore())
                repository.logout()
                assertNull(store.read())
            } finally {
                store.clear()
            }
        }
}
