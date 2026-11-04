package id.rentaid.app

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class KeystoreSessionStoreTest {
    @Test
    fun tokenIsEncryptedAndSurvivesStoreRecreation() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val token = "phase19-test-token"
        val first = KeystoreSessionStore(context, "secure_session_test")
        first.clear()
        try {
            first.write(token)
            val stored = context.getSharedPreferences("secure_session_test", 0).getString("token", "")!!
            assertFalse(stored.contains(token))
            val reopened = KeystoreSessionStore(context, "secure_session_test")
            assertEquals(token, reopened.read())
            reopened.clear()
            assertNull(KeystoreSessionStore(context, "secure_session_test").read())
        } finally {
            first.clear()
        }
    }
}
