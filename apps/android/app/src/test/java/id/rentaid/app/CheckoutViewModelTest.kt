package id.rentaid.app

import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.models.CheckoutInput
import id.rentaid.client.models.Order
import id.rentaid.client.models.Quote
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val product = UUID.randomUUID()
    private val user = UUID.randomUUID()
    private val start = LocalDate.parse("2026-11-05")
    private val end = LocalDate.parse("2026-11-06")
    private val now = Instant.parse("2026-11-04T00:00:00Z")
    private val quote = Quote(product, start, end, 2, 1, 150000, 2, 300000)

    private class MemoryStore : CheckoutAttemptStore {
        var value: CheckoutAttempt? = null

        override fun read() = value

        override fun write(attempt: CheckoutAttempt) {
            value = attempt
        }

        override fun clear() {
            value = null
        }
    }

    private inner class FakeGateway : CheckoutGateway {
        var currentOrigin = "https://example.test"
        override val origin get() = currentOrigin
        var time = now
        var currentUser = user
        val sent = mutableListOf<CheckoutAttempt>()
        var result: CheckoutResult = CheckoutResult.Unknown
        var throwNetwork = false
        var unauthenticated = false

        override suspend fun session(): ServerSession {
            if (unauthenticated) throw ClientException(statusCode = 401)
            return ServerSession(currentUser, time)
        }

        override suspend fun quote(
            id: UUID,
            start: LocalDate,
            end: LocalDate,
            quantity: Int,
        ) = quote

        override suspend fun order(id: UUID): TimedOrder = timedOrder(id)

        override suspend fun checkout(attempt: CheckoutAttempt): CheckoutResult {
            sent.add(attempt)
            if (throwNetwork) throw IOException()
            return result
        }
    }

    private fun timedOrder(id: UUID = UUID.randomUUID()): TimedOrder {
        val created = OffsetDateTime.ofInstant(now, ZoneOffset.UTC)
        val order =
            Order(
                id, "RNT-TEST", product, "Kamera", "Toko", "Jakarta", start, end, 1, 150000, 300000,
                Order.Status.pending_payment, created.plusMinutes(15), created,
            )
        return TimedOrder(order, now)
    }

    @Before fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test fun duplicateTapAndUnknownOutcomeReuseKeyAcrossRecreation() =
        runTest(dispatcher) {
            val gateway = FakeGateway()
            val store = MemoryStore()
            val model = CheckoutViewModel(product, gateway, store) { 0L }
            runCurrent()
            model.getQuote(start.toString(), end.toString(), "1")
            runCurrent()
            gateway.throwNetwork = true
            model.submit()
            model.submit()
            runCurrent()
            assertEquals(1, gateway.sent.size)
            assertTrue(model.state.value.unresolved)
            val first = gateway.sent.single()
            assertEquals(first, store.value)
            val reopened = CheckoutViewModel(product, gateway, store) { 0L }
            runCurrent()
            gateway.throwNetwork = false
            val timed = timedOrder()
            gateway.result = CheckoutResult.Created(timed)
            reopened.resume()
            runCurrent()
            assertEquals(first, gateway.sent.last())
            assertEquals(timed.order.id, store.value?.orderId)
            assertEquals(899L, reopened.state.value.remainingSeconds)
            assertTrue(reopened.finish())
            assertNull(store.value)
        }

    @Test fun changedQuoteNeedsNewConfirmationAndNewKey() =
        runTest(dispatcher) {
            val gateway = FakeGateway()
            val store = MemoryStore()
            val model = CheckoutViewModel(product, gateway, store) { 0L }
            runCurrent()
            model.getQuote(start.toString(), end.toString(), "1")
            runCurrent()
            val changed = quote.copy(available = 1, total = 320000)
            gateway.result = CheckoutResult.Changed(changed)
            model.submit()
            runCurrent()
            assertEquals(changed, model.state.value.quote)
            assertFalse(model.state.value.unresolved)
            assertNull(store.value)
            gateway.result = CheckoutResult.Unknown
            model.submit()
            runCurrent()
            assertNotEquals(gateway.sent[0].key, gateway.sent[1].key)
            assertEquals(320000L, gateway.sent[1].input.expectedTotal)
            assertEquals(1, gateway.sent[1].input.expectedAvailable)
        }

    @Test fun retryIsBlockedForOtherUserAndExpiredKey() =
        runTest(dispatcher) {
            val gateway = FakeGateway()
            val store = MemoryStore()
            store.value = CheckoutAttempt(user, "key", CheckoutInput(product, start, end, 1, 300000, 2), now.toEpochMilli(), gateway.origin)
            val model = CheckoutViewModel(product, gateway, store) { 0L }
            runCurrent()
            gateway.currentOrigin = "https://other.example.test"
            model.resume()
            runCurrent()
            assertTrue(gateway.sent.isEmpty())
            assertTrue(model.state.value.unresolved)
            gateway.currentOrigin = "https://example.test"
            gateway.currentUser = UUID.randomUUID()
            model.resume()
            runCurrent()
            assertTrue(gateway.sent.isEmpty())
            assertTrue(model.state.value.needsLogin)
            gateway.currentUser = user
            gateway.time = now.plusMillis(CheckoutViewModel.KEY_LIFETIME_MILLIS)
            model.resume()
            runCurrent()
            assertTrue(gateway.sent.isEmpty())
            assertTrue(model.state.value.unresolved)
        }

    @Test
    fun loginAndPhoneFailuresDoNotCreateUnknownAttempts() =
        runTest(dispatcher) {
            val gateway = FakeGateway()
            val store = MemoryStore()
            val model = CheckoutViewModel(product, gateway, store) { 0L }
            runCurrent()
            model.getQuote(start.toString(), end.toString(), "1")
            runCurrent()
            gateway.unauthenticated = true
            model.submit()
            runCurrent()
            assertTrue(model.state.value.needsLogin)
            assertNull(store.value)
            gateway.unauthenticated = false
            gateway.result = CheckoutResult.Rejected("phone_required", "Lengkapi nomor telepon.")
            model.submit()
            runCurrent()
            assertTrue(model.state.value.needsProfile)
            assertNull(store.value)
            assertFalse(model.state.value.unresolved)
        }
}
