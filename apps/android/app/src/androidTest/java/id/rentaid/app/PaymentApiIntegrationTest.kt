package id.rentaid.app

import id.rentaid.app.account.data.ApiAccountRepository
import id.rentaid.app.catalog.data.ApiCatalogRepository
import id.rentaid.app.checkout.data.ApiCheckoutGateway
import id.rentaid.app.checkout.data.CheckoutAttempt
import id.rentaid.app.checkout.data.CheckoutResult
import id.rentaid.app.checkout.data.PaymentAttempt
import id.rentaid.app.checkout.data.PaymentResult
import id.rentaid.app.core.security.SessionStore
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.models.CheckoutInput
import id.rentaid.client.models.Order
import id.rentaid.client.models.PaymentInput
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class PaymentApiIntegrationTest {
    private class MemorySession : SessionStore {
        private var token: String? = null

        override fun read() = token

        override fun write(token: String) {
            this.token = token
        }

        override fun clear() {
            token = null
        }
    }

    @Test fun outcomesAndReplaysPersistOnServer() =
        runBlocking {
            val store = MemorySession()
            val account = ApiAccountRepository(BuildConfig.API_BASE_URL, store)
            val email = "payment-${UUID.randomUUID()}@example.test"
            account.register(email, "Phase21-test-password!", "Penyewa Test", "0812345678")
            account.login(email, "Phase21-test-password!")
            val gateway = ApiCheckoutGateway(BuildConfig.API_BASE_URL, store)
            val session = gateway.session()
            val catalog = ApiCatalogRepository(DefaultApi(BuildConfig.API_BASE_URL))
            val product = catalog.products(1, "Kamera Mirrorless", null).single()
            val start = LocalDate.now(ZoneId.of("Asia/Jakarta")).plusDays(2 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
            val cases =
                listOf(
                    PaymentInput.Outcome.succeeded to Order.Status.confirmed,
                    PaymentInput.Outcome.failed to Order.Status.payment_failed,
                    PaymentInput.Outcome.expired to Order.Status.expired,
                )
            cases.forEachIndexed { index, (outcome, expected) ->
                val date = start.plusDays(index.toLong())
                val quote = gateway.quote(product.id, date, date, 1)
                val input = CheckoutInput(product.id, date, date, 1, quote.total, quote.available)
                val checkout =
                    CheckoutAttempt(session.userId, UUID.randomUUID().toString(), input, session.serverTime.toEpochMilli(), gateway.origin)
                val order = (gateway.checkout(checkout) as CheckoutResult.Created).order.order
                val payment = PaymentAttempt(UUID.randomUUID().toString(), outcome, session.serverTime.toEpochMilli())
                assertTrue(gateway.pay(order.id, payment) is PaymentResult.Completed)
                val reopened = ApiCheckoutGateway(BuildConfig.API_BASE_URL, store)
                assertTrue(reopened.pay(order.id, payment) is PaymentResult.Completed)
                assertEquals(expected, reopened.order(order.id).order.status)
            }
        }
}
