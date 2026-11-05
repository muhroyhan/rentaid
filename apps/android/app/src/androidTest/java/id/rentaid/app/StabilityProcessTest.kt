package id.rentaid.app

import androidx.test.platform.app.InstrumentationRegistry
import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.models.Order
import id.rentaid.client.models.PaymentInput
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class StabilityProcessTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    private fun session() = KeystoreSessionStore(context, "phase24_session")

    private fun attempts() = EncryptedCheckoutAttemptStore(KeystoreSessionStore(context, "phase24_pending", clearOnInvalid = false))

    private fun gateway() = ApiCheckoutGateway(BuildConfig.API_BASE_URL, session())

    private fun awaitReady(predicate: () -> Boolean) {
        val deadline = System.nanoTime() + 45_000_000_000L
        while (System.nanoTime() < deadline) {
            if (predicate()) return
            Thread.sleep(25)
        }
        fail("Android state did not settle")
    }

    private fun model(product: UUID): CheckoutViewModel {
        lateinit var model: CheckoutViewModel
        instrumentation.runOnMainSync { model = CheckoutViewModel(product, gateway(), attempts()) }
        awaitReady { !model.state.value.loading }
        return model
    }

    private suspend fun assertStockReserved(saved: CheckoutAttempt) {
        try {
            gateway().quote(saved.input.productId, saved.input.startDate, saved.input.endDate, saved.input.quantity)
            fail("Reserved last stock must remain unavailable after restart")
        } catch (error: ClientException) {
            assertEquals(409, error.statusCode)
        }
    }

    @Test fun exerciseStage() =
        runBlocking {
            val args = InstrumentationRegistry.getArguments()
            val stage = args.getString("stabilityStage")
            assumeTrue(stage != null)
            when (stage) {
                "prepareCheckout" -> {
                    session().clear()
                    attempts().clear()
                    val name = requireNotNull(args.getString("stabilityName"))
                    val accounts = ApiAccountRepository(BuildConfig.API_BASE_URL, session())
                    val email = requireNotNull(args.getString("stabilityEmail"))
                    accounts.register(email, "Phase24-test-password!", name, "0812345678")
                    accounts.login(email, "Phase24-test-password!")
                    val product = UUID.fromString("00000000-0000-4000-8000-000000000030")
                    val date =
                        LocalDate.now(
                            ZoneId.of("Asia/Jakarta"),
                        ).plusDays(2 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
                    val model = model(product)
                    instrumentation.runOnMainSync { model.getQuote(date.toString(), date.toString(), "1") }
                    awaitReady { !model.state.value.loading && model.state.value.quote != null }
                    instrumentation.runOnMainSync { model.submit() }
                    awaitReady { !model.state.value.loading && model.state.value.pending != null }
                    assertNotNull(model.state.value.message)
                    assertNull(attempts().read()?.orderId)
                    assertTrue(model.state.value.unresolved)
                }
                "recoverCheckout" -> {
                    val saved = requireNotNull(attempts().read())
                    val model = model(saved.input.productId)
                    instrumentation.runOnMainSync { model.resume() }
                    awaitReady { !model.state.value.loading && model.state.value.order != null }
                    assertEquals(saved.key, attempts().read()?.key)
                    assertEquals(Order.Status.pending_payment, model.state.value.order?.order?.status)
                    assertNotNull(attempts().read()?.orderId)
                    assertStockReserved(saved)
                }
                "preparePayment" -> {
                    val saved = requireNotNull(attempts().read())
                    val model = model(saved.input.productId)
                    awaitReady { model.state.value.order != null }
                    instrumentation.runOnMainSync { model.pay(PaymentInput.Outcome.succeeded) }
                    awaitReady { !model.state.value.loading && model.state.value.pending?.payment != null }
                    assertNotNull(model.state.value.message)
                    assertNotNull(attempts().read()?.payment)
                }
                "recoverPayment" -> {
                    val saved = requireNotNull(attempts().read())
                    assertNotNull(saved.payment)
                    val model = model(saved.input.productId)
                    awaitReady { !model.state.value.loading && model.state.value.order?.order?.status == Order.Status.confirmed }
                    assertNull(attempts().read()?.payment)
                    val detail = ApiOrderRepository(BuildConfig.API_BASE_URL, session()).detail(requireNotNull(saved.orderId))
                    assertEquals(detail.order.total, detail.payment?.amount)
                    assertEquals(1, detail.history.count { it.toStatus.value == "confirmed" })
                    assertStockReserved(saved)
                }
                "offline" -> {
                    val token = session().read()
                    assertNotNull(token)
                    try {
                        ApiAccountRepository(BuildConfig.API_BASE_URL, session()).restore()
                        fail("Offline restoration must fail")
                    } catch (error: java.io.IOException) {
                        assertTrue(token == session().read())
                    }
                    assertNotNull(attempts().read()?.orderId)
                }
                "online" -> {
                    assertNotNull(ApiAccountRepository(BuildConfig.API_BASE_URL, session()).restore())
                    val saved = requireNotNull(attempts().read())
                    assertEquals(Order.Status.confirmed, gateway().order(requireNotNull(saved.orderId)).order.status)
                }
                "revoked" -> {
                    try {
                        ApiAccountRepository(BuildConfig.API_BASE_URL, session()).restore()
                        fail("Suspended account must lose its session")
                    } catch (error: SessionExpired) {
                        assertNull(session().read())
                    }
                    assertNotNull(attempts().read()?.orderId)
                    attempts().clear()
                }
                else -> fail("Unknown stability stage")
            }
        }
}
