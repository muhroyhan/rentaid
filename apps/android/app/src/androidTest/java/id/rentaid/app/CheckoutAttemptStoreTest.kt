package id.rentaid.app

import androidx.test.platform.app.InstrumentationRegistry
import id.rentaid.app.checkout.data.CheckoutAttempt
import id.rentaid.app.checkout.data.EncryptedCheckoutAttemptStore
import id.rentaid.app.core.security.KeystoreSessionStore
import id.rentaid.client.models.CheckoutInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test
import java.time.LocalDate
import java.util.UUID

class CheckoutAttemptStoreTest {
    @Test fun pendingAttemptIsEncryptedAndCorruptionDoesNotDiscardIt() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "phase21_attempt_test"
        val encrypted = KeystoreSessionStore(context, name, clearOnInvalid = false)
        val store = EncryptedCheckoutAttemptStore(encrypted)
        val id = UUID.randomUUID()
        val date = LocalDate.parse("2026-11-05")
        val attempt = CheckoutAttempt(id, "phase21-secret-key", CheckoutInput(id, date, date, 1, 12000, 2), 10, "https://example.test")
        store.clear()
        try {
            store.write(attempt)
            val raw = context.getSharedPreferences(name, 0).getString("token", "")!!
            assertFalse(raw.contains(attempt.key))
            val reopened = EncryptedCheckoutAttemptStore(KeystoreSessionStore(context, name, clearOnInvalid = false))
            assertEquals(attempt, reopened.read())
            context.getSharedPreferences(name, 0).edit().putString("token", "corrupt").commit()
            assertThrows(IllegalStateException::class.java) { reopened.read() }
            assertEquals("corrupt", context.getSharedPreferences(name, 0).getString("token", ""))
        } finally {
            store.clear()
        }
    }
}
