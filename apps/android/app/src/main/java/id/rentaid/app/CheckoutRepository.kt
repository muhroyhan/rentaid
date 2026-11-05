package id.rentaid.app

import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.infrastructure.ClientError
import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.infrastructure.Serializer
import id.rentaid.client.infrastructure.Success
import id.rentaid.client.models.Checkout409Response
import id.rentaid.client.models.CheckoutInput
import id.rentaid.client.models.Order
import id.rentaid.client.models.PaymentInput
import id.rentaid.client.models.Quote
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.time.Instant
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

data class CheckoutAttempt(
    val userId: UUID,
    val key: String,
    val input: CheckoutInput,
    val startedAtServerMillis: Long,
    val origin: String,
    val orderId: UUID? = null,
    val payment: PaymentAttempt? = null,
)

data class PaymentAttempt(val key: String, val outcome: PaymentInput.Outcome, val startedAtServerMillis: Long)

data class ServerSession(val userId: UUID, val serverTime: Instant)

data class TimedOrder(val order: Order, val serverTime: Instant, val roundTripMillis: Long = 0)

sealed interface CheckoutResult {
    data class Created(val order: TimedOrder) : CheckoutResult

    data class Changed(val quote: Quote) : CheckoutResult

    data class Rejected(val code: String, val message: String) : CheckoutResult

    data object Unknown : CheckoutResult
}

sealed interface PaymentResult {
    data object Completed : PaymentResult

    data class Rejected(val code: String, val message: String) : PaymentResult

    data object Unknown : PaymentResult
}

interface CheckoutGateway {
    val origin: String

    suspend fun session(): ServerSession

    suspend fun quote(
        id: UUID,
        start: LocalDate,
        end: LocalDate,
        quantity: Int,
    ): Quote

    suspend fun checkout(attempt: CheckoutAttempt): CheckoutResult

    suspend fun order(id: UUID): TimedOrder

    suspend fun pay(
        orderId: UUID,
        attempt: PaymentAttempt,
    ): PaymentResult = PaymentResult.Unknown
}

interface CheckoutAttemptStore {
    fun read(): CheckoutAttempt?

    fun write(attempt: CheckoutAttempt)

    fun clear()
}

class EncryptedCheckoutAttemptStore(private val store: SessionStore) : CheckoutAttemptStore {
    override fun read(): CheckoutAttempt? = store.read()?.let { Serializer.gson.fromJson(it, CheckoutAttempt::class.java) }

    override fun write(attempt: CheckoutAttempt) = store.write(Serializer.gson.toJson(attempt))

    override fun clear() = store.clear()
}

class ApiCheckoutGateway(baseUrl: String, sessionStore: SessionStore) : CheckoutGateway {
    override val origin: String = baseUrl.trimEnd('/')
    private val client =
        OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).addInterceptor { chain ->
            val request = chain.request()
            val needsSession =
                request.url.encodedPath == "/api/v1/auth/session" ||
                    request.url.encodedPath == "/api/v1/checkout" || request.url.encodedPath == "/api/v1/payment-simulator" ||
                    request.url.encodedPath.startsWith("/api/v1/orders/")
            val token = if (needsSession) sessionStore.read() else null
            chain.proceed(if (token != null) request.newBuilder().header("Authorization", "Bearer $token").build() else request)
        }.build()
    private val api = DefaultApi(baseUrl, client)

    private fun serverTime(headers: Map<String, List<String>>): Instant {
        val value =
            headers.entries.firstOrNull { it.key.equals("Date", ignoreCase = true) }?.value?.firstOrNull()
                ?: throw IllegalStateException("Missing server time")
        return ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()
    }

    override suspend fun session(): ServerSession =
        withContext(Dispatchers.IO) {
            val result = api.getSessionWithHttpInfo()
            when (result) {
                is Success -> ServerSession(requireNotNull(result.data).user.id, serverTime(result.headers))
                is ClientError -> throw ClientException(statusCode = result.statusCode)
                else -> throw IllegalStateException("Session unavailable")
            }
        }

    override suspend fun quote(
        id: UUID,
        start: LocalDate,
        end: LocalDate,
        quantity: Int,
    ): Quote = withContext(Dispatchers.IO) { api.getProductQuote(id, start, end, quantity) }

    override suspend fun checkout(attempt: CheckoutAttempt): CheckoutResult =
        withContext(Dispatchers.IO) {
            val started = System.nanoTime()
            val result = api.checkoutWithHttpInfo(attempt.key, attempt.input, null)
            val roundTrip = (System.nanoTime() - started) / 1_000_000
            when (result) {
                is Success -> CheckoutResult.Created(TimedOrder(requireNotNull(result.data), serverTime(result.headers), roundTrip))
                is ClientError -> {
                    val body = result.body as? String
                    val json = runCatching { com.google.gson.JsonParser.parseString(body).asJsonObject }.getOrNull()
                    val code = json?.get("code")?.asString
                    val message = json?.get("message")?.asString
                    when {
                        code == "quote_changed" && json?.has("quote") == true -> {
                            val changed = Serializer.gson.fromJson(json, Checkout409Response::class.java)
                            CheckoutResult.Changed(changed.quote)
                        }
                        code == "idempotency_key_reuse" || code == null -> CheckoutResult.Unknown
                        else -> CheckoutResult.Rejected(code, message ?: "Permintaan ditolak.")
                    }
                }
                else -> CheckoutResult.Unknown
            }
        }

    override suspend fun order(id: UUID): TimedOrder =
        withContext(Dispatchers.IO) {
            val started = System.nanoTime()
            val result = api.getOrderWithHttpInfo(id)
            val roundTrip = (System.nanoTime() - started) / 1_000_000
            when (result) {
                is Success -> TimedOrder(requireNotNull(result.data), serverTime(result.headers), roundTrip)
                is ClientError -> throw ClientException(statusCode = result.statusCode)
                else -> throw IllegalStateException("Order unavailable")
            }
        }

    override suspend fun pay(
        orderId: UUID,
        attempt: PaymentAttempt,
    ): PaymentResult =
        withContext(Dispatchers.IO) {
            when (val result = api.simulatePaymentWithHttpInfo(attempt.key, PaymentInput(orderId, attempt.outcome), null)) {
                is Success -> PaymentResult.Completed
                is ClientError -> {
                    val json = runCatching { com.google.gson.JsonParser.parseString(result.body as? String).asJsonObject }.getOrNull()
                    val code = json?.get("code")?.asString
                    if (code == null || code == "idempotency_key_reuse") {
                        PaymentResult.Unknown
                    } else {
                        PaymentResult.Rejected(code, json.get("message")?.asString ?: "Pembayaran belum dapat diproses.")
                    }
                }
                else -> PaymentResult.Unknown
            }
        }
}
