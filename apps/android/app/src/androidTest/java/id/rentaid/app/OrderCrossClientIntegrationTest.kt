package id.rentaid.app

import androidx.test.platform.app.InstrumentationRegistry
import com.google.gson.JsonParser
import id.rentaid.app.account.data.ApiAccountRepository
import id.rentaid.app.catalog.data.ApiCatalogRepository
import id.rentaid.app.checkout.data.ApiCheckoutGateway
import id.rentaid.app.checkout.data.CheckoutAttempt
import id.rentaid.app.checkout.data.CheckoutResult
import id.rentaid.app.checkout.data.PaymentAttempt
import id.rentaid.app.checkout.data.PaymentResult
import id.rentaid.app.core.security.SessionStore
import id.rentaid.app.orders.data.ApiOrderRepository
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.models.CancelInput
import id.rentaid.client.models.CheckoutInput
import id.rentaid.client.models.Order
import id.rentaid.client.models.PaymentInput
import kotlinx.coroutines.runBlocking
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class OrderCrossClientIntegrationTest {
    private class MemorySession : SessionStore {
        var value: String? = null

        override fun read() = value

        override fun write(token: String) {
            value = token
        }

        override fun clear() {
            value = null
        }
    }

    private class BrowserCookies : CookieJar {
        private val values = mutableMapOf<String, Cookie>()

        override fun saveFromResponse(
            url: HttpUrl,
            cookies: List<Cookie>,
        ) {
            cookies.forEach { if (it.expiresAt <= System.currentTimeMillis()) values.remove(it.name) else values[it.name] = it }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> = values.values.filter { it.matches(url) }
    }

    private val base = BuildConfig.API_BASE_URL
    private val password = "Phase23-test-password!"
    private val json = "application/json".toMediaType()

    private suspend fun renter(name: String = "Penyewa Uji"): Pair<String, MemorySession> {
        val email = "phase23-${UUID.randomUUID()}@example.test"
        val session = MemorySession()
        val account = ApiAccountRepository(base, session)
        account.register(email, password, name, "0812345678")
        account.login(email, password)
        return email to session
    }

    private fun browser(email: String): Pair<OkHttpClient, String> {
        val client = OkHttpClient.Builder().cookieJar(BrowserCookies()).build()
        val csrf =
            client.newCall(Request.Builder().url("$base/api/v1/auth/csrf").build()).execute().use {
                JsonParser.parseString(it.body!!.string()).asJsonObject["csrfToken"].asString
            }
        val body = """{"email":"$email","password":"$password","client":"marketplace"}"""
        val request =
            Request.Builder().url("$base/api/v1/auth/login").header("Origin", "http://localhost:18083")
                .header("X-CSRF-Token", csrf).post(body.toRequestBody(json)).build()
        val sessionCsrf =
            client.newCall(request).execute().use {
                check(it.code == 200)
                JsonParser.parseString(it.body!!.string()).asJsonObject["csrfToken"].asString
            }
        return client to sessionCsrf
    }

    private fun post(
        client: OkHttpClient,
        csrf: String,
        path: String,
        body: String = "",
    ): Int {
        val req =
            Request.Builder().url("$base$path").header("Origin", "http://localhost:18083")
                .header("X-CSRF-Token", csrf).post(body.toRequestBody(if (body.isEmpty()) null else json)).build()
        return client.newCall(req).execute().use { it.code }
    }

    private suspend fun confirmed(
        session: MemorySession,
        date: LocalDate = LocalDate.now(ZoneId.of("Asia/Jakarta")),
    ): Pair<UUID, ApiOrderRepository> {
        val gateway = ApiCheckoutGateway(base, session)
        val owner = gateway.session()
        val catalog = ApiCatalogRepository(DefaultApi(base))
        val product = catalog.products(1, "Kamera Mirrorless", null).single()
        val quote = gateway.quote(product.id, date, date, 1)
        val input = CheckoutInput(product.id, date, date, 1, quote.total, quote.available)
        val attempt = CheckoutAttempt(owner.userId, UUID.randomUUID().toString(), input, owner.serverTime.toEpochMilli(), gateway.origin)
        val order = (gateway.checkout(attempt) as CheckoutResult.Created).order.order
        val payment = PaymentAttempt(UUID.randomUUID().toString(), PaymentInput.Outcome.succeeded, owner.serverTime.toEpochMilli())
        assertTrue(gateway.pay(order.id, payment) is PaymentResult.Completed)
        return order.id to ApiOrderRepository(base, session)
    }

    @Test fun androidTracksVendorBrowserActions() =
        runBlocking {
            assumeTrue(InstrumentationRegistry.getArguments().getString("phase23Browser") == "true")
            val name = requireNotNull(InstrumentationRegistry.getArguments().getString("phase23Name"))
            val (_, session) = renter(name)
            val (id, orders) = confirmed(session)

            suspend fun awaitStatus(expected: Order.Status) {
                val deadline = System.nanoTime() + 90_000_000_000L
                while (System.nanoTime() < deadline) {
                    if (orders.detail(id).order.status == expected) return
                    kotlinx.coroutines.delay(250)
                }
                fail("Timed out waiting for $expected")
            }
            awaitStatus(Order.Status.renting)
            awaitStatus(Order.Status.completed)
            val detail = orders.detail(id)
            assertTrue(detail.history.any { it.toStatus.value == "renting" })
            assertTrue(detail.history.any { it.toStatus.value == "completed" })
        }

    @Test fun vendorWebHandoverAndReturnAreVisibleOnAndroidAndLateCancellationIsRejected() =
        runBlocking {
            val (_, session) = renter()
            val (id, orders) = confirmed(session)
            assertEquals(Order.Status.confirmed, orders.detail(id).order.status)
            val (vendor, csrf) = browser("demo.approved@example.test")
            assertEquals(200, post(vendor, csrf, "/api/v1/vendor/orders/$id/handover"))
            assertEquals(Order.Status.renting, orders.detail(id).order.status)
            try {
                orders.cancel(id, CancelInput.ExpectedStatus.confirmed)
                fail("Late cancellation must fail")
            } catch (error: ClientException) {
                assertEquals(409, error.statusCode)
            }
            assertEquals(200, post(vendor, csrf, "/api/v1/vendor/orders/$id/return"))
            val detail = orders.detail(id)
            assertEquals(Order.Status.completed, detail.order.status)
            assertNotNull(detail.order.returnedAt)
            assertTrue(detail.history.any { it.toStatus.value == "renting" })
            assertTrue(detail.history.any { it.toStatus.value == "completed" })
        }

    @Test fun webCancellationAndRefundAreVisibleOnAndroid() =
        runBlocking {
            val (email, session) = renter()
            val date = LocalDate.now(ZoneId.of("Asia/Jakarta")).plusDays(2 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
            val (id, orders) = confirmed(session, date)
            val (web, csrf) = browser(email)
            assertEquals(200, post(web, csrf, "/api/v1/orders/$id/cancel", """{"expectedStatus":"confirmed"}"""))
            val detail = orders.detail(id)
            assertEquals(Order.Status.cancelled, detail.order.status)
            assertEquals(detail.order.total, detail.refund?.amount)
        }

    @Test fun pendingOrderCanBeCancelledWithoutRefund() =
        runBlocking {
            val (_, session) = renter()
            val gateway = ApiCheckoutGateway(base, session)
            val owner = gateway.session()
            val product = ApiCatalogRepository(DefaultApi(base)).products(1, "Kamera Mirrorless", null).single()
            val date = LocalDate.now(ZoneId.of("Asia/Jakarta")).plusDays(2 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
            val quote = gateway.quote(product.id, date, date, 1)
            val input = CheckoutInput(product.id, date, date, 1, quote.total, quote.available)
            val attempt =
                CheckoutAttempt(owner.userId, UUID.randomUUID().toString(), input, owner.serverTime.toEpochMilli(), gateway.origin)
            val id = (gateway.checkout(attempt) as CheckoutResult.Created).order.order.id
            val orders = ApiOrderRepository(base, session)
            orders.cancel(id, CancelInput.ExpectedStatus.pending_payment)
            val detail = orders.detail(id)
            assertEquals(Order.Status.cancelled, detail.order.status)
            assertTrue(detail.refund == null)
            assertTrue(detail.payment == null)
        }

    @Test fun androidCancellationAndRefundMatchWebAndOtherUserIsDenied() =
        runBlocking {
            val (email, session) = renter()
            val (id, orders) = confirmed(session)
            assertTrue(orders.list(1).any { it.id == id })
            val (_, stranger) = renter()
            val strangerOrders = ApiOrderRepository(base, stranger)
            try {
                strangerOrders.detail(id)
                fail("Other user must not access order")
            } catch (error: ClientException) {
                assertEquals(404, error.statusCode)
            }
            try {
                strangerOrders.cancel(id, CancelInput.ExpectedStatus.confirmed)
                fail("Other user must not cancel order")
            } catch (error: ClientException) {
                assertEquals(404, error.statusCode)
            }
            orders.cancel(id, CancelInput.ExpectedStatus.confirmed)
            orders.cancel(id, CancelInput.ExpectedStatus.confirmed)
            val detail = orders.detail(id)
            assertEquals(Order.Status.cancelled, detail.order.status)
            assertEquals(detail.order.total, detail.refund?.amount)
            assertNotNull(detail.payment)
            val (web, _) = browser(email)
            val req = Request.Builder().url("$base/api/v1/orders/$id/detail").build()
            web.newCall(req).execute().use { response ->
                assertEquals(200, response.code)
                val body = JsonParser.parseString(response.body!!.string()).asJsonObject
                assertEquals("cancelled", body["order"].asJsonObject["status"].asString)
                assertEquals(detail.order.total, body["refund"].asJsonObject["amount"].asLong)
            }
        }
}
