package id.rentaid.app

import androidx.test.platform.app.InstrumentationRegistry
import id.rentaid.app.account.data.ApiAccountRepository
import id.rentaid.app.catalog.data.ApiCatalogRepository
import id.rentaid.app.checkout.data.ApiCheckoutGateway
import id.rentaid.app.checkout.data.CheckoutAttempt
import id.rentaid.app.checkout.data.CheckoutResult
import id.rentaid.app.checkout.data.EncryptedCheckoutAttemptStore
import id.rentaid.app.checkout.data.PaymentAttempt
import id.rentaid.app.checkout.data.PaymentResult
import id.rentaid.app.core.security.KeystoreSessionStore
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.models.CheckoutInput
import id.rentaid.client.models.Order
import id.rentaid.client.models.PaymentInput
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.FixMethodOrder
import org.junit.Test
import org.junit.runners.MethodSorters
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class PaymentRecoveryProcessTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    private fun session() = KeystoreSessionStore(context, "phase22_recovery_session")

    private fun attempts() =
        EncryptedCheckoutAttemptStore(KeystoreSessionStore(context, "phase22_recovery_pending", clearOnInvalid = false))

    @Test fun prepareInterruptedPayment() =
        runBlocking {
            val session = session()
            val attempts = attempts()
            session.clear()
            attempts.clear()
            val account = ApiAccountRepository(BuildConfig.API_BASE_URL, session)
            val email = "payment-recovery-${UUID.randomUUID()}@example.test"
            account.register(email, "Phase21-test-password!", "Penyewa Test", "0812345678")
            account.login(email, "Phase21-test-password!")
            val gateway = ApiCheckoutGateway(BuildConfig.API_BASE_URL, session)
            val owner = gateway.session()
            val catalog = ApiCatalogRepository(DefaultApi(BuildConfig.API_BASE_URL))
            val product = catalog.products(1, "Kamera Mirrorless", null).single()
            val date = LocalDate.now(ZoneId.of("Asia/Jakarta")).plusDays(2 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
            val quote = gateway.quote(product.id, date, date, 1)
            val input = CheckoutInput(product.id, date, date, 1, quote.total, quote.available)
            val checkout =
                CheckoutAttempt(owner.userId, UUID.randomUUID().toString(), input, owner.serverTime.toEpochMilli(), gateway.origin)
            val order = (gateway.checkout(checkout) as CheckoutResult.Created).order.order
            val payment = PaymentAttempt(UUID.randomUUID().toString(), PaymentInput.Outcome.succeeded, owner.serverTime.toEpochMilli())
            attempts.write(checkout.copy(orderId = order.id, payment = payment))
            assertTrue(gateway.pay(order.id, payment) is PaymentResult.Completed)
        }

    @Test fun recoverInterruptedPayment() =
        runBlocking {
            val session = session()
            val attempts = attempts()
            try {
                val pending = requireNotNull(attempts.read())
                val gateway = ApiCheckoutGateway(BuildConfig.API_BASE_URL, session)
                assertEquals(pending.userId, gateway.session().userId)
                assertTrue(gateway.pay(requireNotNull(pending.orderId), requireNotNull(pending.payment)) is PaymentResult.Completed)
                assertEquals(Order.Status.confirmed, gateway.order(pending.orderId).order.status)
            } finally {
                attempts.clear()
                session.clear()
            }
            assertNull(attempts.read())
        }
}
