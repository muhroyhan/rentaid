package id.rentaid.app

import com.google.gson.JsonParser
import id.rentaid.app.account.data.ApiAccountRepository
import id.rentaid.app.catalog.data.ApiCatalogRepository
import id.rentaid.app.checkout.data.ApiCheckoutGateway
import id.rentaid.app.checkout.data.CheckoutAttempt
import id.rentaid.app.checkout.data.CheckoutResult
import id.rentaid.app.core.security.SessionStore
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.infrastructure.Serializer
import id.rentaid.client.models.CheckoutInput
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.CountDownLatch

class CheckoutApiIntegrationTest {
    private class MemorySession : SessionStore {
        var token: String? = null

        override fun read() = token

        override fun write(token: String) {
            this.token = token
        }

        override fun clear() {
            token = null
        }
    }

    private class BrowserCookies : CookieJar {
        private val cookies = mutableMapOf<String, Cookie>()

        override fun saveFromResponse(
            url: HttpUrl,
            cookies: List<Cookie>,
        ) {
            cookies.forEach { if (it.expiresAt <= System.currentTimeMillis()) this.cookies.remove(it.name) else this.cookies[it.name] = it }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> = cookies.values.filter { it.matches(url) }
    }

    private val baseUrl = BuildConfig.API_BASE_URL
    private val password = "Phase21-test-password!"
    private val media = "application/json".toMediaType()

    private suspend fun user(prefix: String): Pair<String, MemorySession> {
        val email = "$prefix-${UUID.randomUUID()}@example.test"
        val store = MemorySession()
        val accounts = ApiAccountRepository(baseUrl, store)
        accounts.register(email, password, "Test Android", "0812345678")
        accounts.login(email, password)
        return email to store
    }

    private fun browserLogin(email: String): Pair<OkHttpClient, String> {
        val browser = OkHttpClient.Builder().cookieJar(BrowserCookies()).build()
        val csrfRequest = Request.Builder().url("$baseUrl/api/v1/auth/csrf").build()
        val loginCsrf =
            browser.newCall(csrfRequest).execute().use { response ->
                JsonParser.parseString(response.body!!.string()).asJsonObject["csrfToken"].asString
            }
        val loginJson = """{"email":"$email","password":"$password","client":"marketplace"}"""
        val loginRequest =
            Request.Builder().url("$baseUrl/api/v1/auth/login")
                .header("Origin", "http://localhost:18083")
                .header("X-CSRF-Token", loginCsrf)
                .post(loginJson.toRequestBody(media)).build()
        val csrf =
            browser.newCall(loginRequest).execute().use { response ->
                check(response.code == 200)
                JsonParser.parseString(response.body!!.string()).asJsonObject["csrfToken"].asString
            }
        return browser to csrf
    }

    @Test fun browserAndAndroidRaceForLastStock() =
        runBlocking {
            val (_, androidStore) = user("android-race")
            val (browserEmail, _) = user("browser-race")
            val gateway = ApiCheckoutGateway(baseUrl, androidStore)
            val session = gateway.session()
            val productId = UUID.fromString("00000000-0000-4000-8000-000000000030")
            val start = LocalDate.now(ZoneId.of("Asia/Jakarta")).plusDays(2 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
            val end = start.plusDays(1)
            val androidQuote = gateway.quote(productId, start, end, 1)
            val (browser, csrf) = browserLogin(browserEmail)
            val webUrl = "$baseUrl/api/v1/products/$productId/quote?start_date=$start&end_date=$end&quantity=1"
            val webQuote =
                browser.newCall(Request.Builder().url(webUrl).build()).execute().use { response ->
                    check(response.code == 200)
                    JsonParser.parseString(response.body!!.string()).asJsonObject
                }
            assertEquals(androidQuote.total, webQuote["total"].asLong)
            assertEquals(androidQuote.available, webQuote["available"].asInt)
            assertEquals(1, androidQuote.available)
            val input = CheckoutInput(productId, start, end, 1, androidQuote.total, androidQuote.available)
            val attempt =
                CheckoutAttempt(session.userId, UUID.randomUUID().toString(), input, session.serverTime.toEpochMilli(), gateway.origin)
            val browserRequest =
                Request.Builder().url("$baseUrl/api/v1/checkout")
                    .header("Origin", "http://localhost:18083")
                    .header("X-CSRF-Token", csrf)
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .post(Serializer.gson.toJson(input).toRequestBody(media)).build()
            val gate = CountDownLatch(1)
            val results =
                coroutineScope {
                    val android =
                        async(Dispatchers.IO) {
                            gate.await()
                            gateway.checkout(attempt)
                        }
                    val web =
                        async(Dispatchers.IO) {
                            gate.await()
                            browser.newCall(browserRequest).execute().use { it.code }
                        }
                    gate.countDown()
                    android.await() to web.await()
                }
            assertTrue(
                (results.first is CheckoutResult.Created && results.second == 409) ||
                    (results.first is CheckoutResult.Changed && results.second == 201),
            )
        }

    @Test fun changedAvailabilityReturnsUpdatedQuote() =
        runBlocking {
            val (_, firstStore) = user("changed-first")
            val (_, secondStore) = user("changed-second")
            val first = ApiCheckoutGateway(baseUrl, firstStore)
            val second = ApiCheckoutGateway(baseUrl, secondStore)
            val api = ApiCatalogRepository(DefaultApi(baseUrl))
            val product = api.products(1, "Kamera Mirrorless", null).single()
            val start = LocalDate.now(ZoneId.of("Asia/Jakarta")).plusDays(2 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
            val before = first.quote(product.id, start, start, 1)
            val input = CheckoutInput(product.id, start, start, 1, before.total, before.available)
            val other = second.session()
            val otherAttempt =
                CheckoutAttempt(other.userId, UUID.randomUUID().toString(), input, other.serverTime.toEpochMilli(), second.origin)
            assertTrue(second.checkout(otherAttempt) is CheckoutResult.Created)
            val owner = first.session()
            val original = CheckoutAttempt(owner.userId, UUID.randomUUID().toString(), input, owner.serverTime.toEpochMilli(), first.origin)
            val changed = first.checkout(original) as CheckoutResult.Changed
            assertEquals(before.available - 1, changed.quote.available)
            assertEquals(before.total, changed.quote.total)
        }

    @Test fun retryAfterLostResponseReturnsSameOrder() =
        runBlocking {
            val (_, store) = user("retry")
            val gateway = ApiCheckoutGateway(baseUrl, store)
            val session = gateway.session()
            val api = ApiCatalogRepository(DefaultApi(baseUrl))
            val product = api.products(1, "Kamera Mirrorless", null).single()
            val start = LocalDate.now(ZoneId.of("Asia/Jakarta")).plusDays(2 + Math.floorMod(UUID.randomUUID().leastSignificantBits, 10000L))
            val quote = gateway.quote(product.id, start, start, 1)
            val input = CheckoutInput(product.id, start, start, 1, quote.total, quote.available)
            val attempt =
                CheckoutAttempt(session.userId, UUID.randomUUID().toString(), input, session.serverTime.toEpochMilli(), gateway.origin)
            val first = gateway.checkout(attempt) as CheckoutResult.Created
            val retried = ApiCheckoutGateway(baseUrl, store).checkout(attempt) as CheckoutResult.Created
            assertEquals(first.order.order.id, retried.order.order.id)
            assertEquals(first.order.order.total, retried.order.order.total)
            val request =
                Request.Builder().url("$baseUrl/api/v1/orders")
                    .header("Authorization", "Bearer ${store.read()}").build()
            val orders =
                OkHttpClient().newCall(request).execute().use { response ->
                    check(response.code == 200)
                    JsonParser.parseString(response.body!!.string()).asJsonArray
                }
            assertEquals(1, orders.size())
        }
}
