package id.rentaid.app

import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.models.CheckoutInput
import id.rentaid.client.models.Quote
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID

data class CheckoutState(
    val loading: Boolean = true,
    val quote: Quote? = null,
    val pending: CheckoutAttempt? = null,
    val order: TimedOrder? = null,
    val remainingSeconds: Long? = null,
    val message: String? = null,
    val needsLogin: Boolean = false,
    val needsProfile: Boolean = false,
    val unresolved: Boolean = false,
)

class CheckoutViewModel(
    private val productId: UUID,
    private val gateway: CheckoutGateway,
    private val store: CheckoutAttemptStore,
    private val elapsedMillis: () -> Long = { SystemClock.elapsedRealtime() },
) : ViewModel() {
    private val mutableState = MutableStateFlow(CheckoutState())
    val state = mutableState.asStateFlow()
    private var timer: Job? = null

    init {
        viewModelScope.launch {
            try {
                val pending = store.read()
                mutableState.value = CheckoutState(loading = false, pending = pending, unresolved = pending != null)
                if (pending?.orderId != null) resume()
            } catch (error: Exception) {
                mutableState.value =
                    CheckoutState(loading = false, unresolved = true, message = "Data checkout tersimpan tidak dapat dibaca.")
            }
        }
    }

    fun getQuote(
        startText: String,
        endText: String,
        quantityText: String,
    ) {
        if (mutableState.value.loading || mutableState.value.unresolved) return
        val start = runCatching { LocalDate.parse(startText.trim()) }.getOrNull()
        val end = runCatching { LocalDate.parse(endText.trim()) }.getOrNull()
        val quantity = quantityText.toIntOrNull()
        if (start == null || end == null || quantity == null || quantity < 1) {
            mutableState.value =
                mutableState.value.copy(message = "Isi tanggal dengan format YYYY-MM-DD dan jumlah minimal 1.", quote = null)
            return
        }
        mutableState.value = mutableState.value.copy(loading = true, message = null, quote = null)
        viewModelScope.launch {
            try {
                mutableState.value = CheckoutState(loading = false, quote = gateway.quote(productId, start, end, quantity))
            } catch (error: CancellationException) {
                throw error
            } catch (error: ClientException) {
                val message =
                    when (error.statusCode) {
                        400 -> "Tanggal atau jumlah sewa tidak valid."
                        404 -> "Produk tidak tersedia."
                        else -> "Penawaran tidak dapat dimuat. Coba lagi."
                    }
                mutableState.value = CheckoutState(loading = false, message = message)
            } catch (error: Exception) {
                mutableState.value =
                    CheckoutState(loading = false, message = "Penawaran tidak dapat dimuat. Periksa koneksi dan coba lagi.")
            }
        }
    }

    fun invalidateQuote() {
        if (!mutableState.value.loading && !mutableState.value.unresolved) {
            mutableState.value = mutableState.value.copy(quote = null, message = null)
        }
    }

    fun submit() {
        val current = mutableState.value
        if (current.loading || current.unresolved) return
        val quote = current.quote ?: return
        if (quote.available < quote.quantity) {
            mutableState.value = current.copy(message = "Stok tidak mencukupi untuk tanggal ini.")
            return
        }
        mutableState.value = current.copy(loading = true, message = null, needsLogin = false, needsProfile = false)
        viewModelScope.launch {
            try {
                val session = gateway.session()
                val attempt =
                    CheckoutAttempt(
                        session.userId,
                        UUID.randomUUID().toString(),
                        CheckoutInput(quote.productId, quote.startDate, quote.endDate, quote.quantity, quote.total, quote.available),
                        session.serverTime.toEpochMilli(),
                        gateway.origin,
                    )
                store.write(attempt)
                mutableState.value = mutableState.value.copy(pending = attempt, unresolved = true)
                send(attempt)
            } catch (error: CancellationException) {
                throw error
            } catch (error: ClientException) {
                mutableState.value =
                    mutableState.value.copy(
                        loading = false,
                        needsLogin = error.statusCode == 401,
                        message = if (error.statusCode == 401) "Silakan masuk sebelum checkout." else "Sesi tidak dapat diperiksa.",
                    )
            } catch (error: Exception) {
                mutableState.value =
                    mutableState.value.copy(
                        loading = false,
                        message = "Checkout belum dapat dimulai. Periksa koneksi dan coba lagi.",
                    )
            }
        }
    }

    fun resume() {
        val pending = mutableState.value.pending ?: return
        if (mutableState.value.loading) return
        mutableState.value = mutableState.value.copy(loading = true, message = null, needsLogin = false)
        viewModelScope.launch {
            try {
                if (pending.origin != gateway.origin) {
                    mutableState.value =
                        mutableState.value.copy(loading = false, message = "Gunakan server yang memulai checkout ini untuk melanjutkan.")
                    return@launch
                }
                val session = gateway.session()
                if (session.userId != pending.userId) {
                    mutableState.value =
                        mutableState.value.copy(
                            loading = false,
                            message = "Masuk dengan akun yang memulai checkout ini.",
                            needsLogin = true,
                        )
                    return@launch
                }
                if (pending.orderId != null) {
                    showOrder(gateway.order(pending.orderId))
                } else if (session.serverTime.toEpochMilli() - pending.startedAtServerMillis >= RETRY_LIMIT_MILLIS) {
                    mutableState.value =
                        mutableState.value.copy(
                            loading = false,
                            message =
                                "Hasil checkout belum diketahui dan batas percobaan ulang telah habis. " +
                                    "Periksa pesanan melalui admin.",
                        )
                } else {
                    send(pending)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: ClientException) {
                mutableState.value =
                    mutableState.value.copy(
                        loading = false,
                        needsLogin = error.statusCode == 401,
                        message =
                            if (error.statusCode == 401) {
                                "Sesi tidak berlaku. Masuk kembali untuk melanjutkan."
                            } else {
                                "Hasil checkout belum dapat diperiksa."
                            },
                    )
            } catch (error: Exception) {
                mutableState.value =
                    mutableState.value.copy(
                        loading = false,
                        message = "Hasil checkout belum diketahui. Coba lagi dengan data yang sama.",
                    )
            }
        }
    }

    private suspend fun send(attempt: CheckoutAttempt) {
        try {
            when (val result = gateway.checkout(attempt)) {
                is CheckoutResult.Created -> {
                    val completed = attempt.copy(orderId = result.order.order.id)
                    store.write(completed)
                    mutableState.value = mutableState.value.copy(pending = completed)
                    showOrder(result.order)
                }
                is CheckoutResult.Changed -> {
                    store.clear()
                    mutableState.value =
                        CheckoutState(
                            loading = false,
                            quote = result.quote,
                            message = "Harga atau ketersediaan berubah. Periksa penawaran terbaru.",
                        )
                }
                is CheckoutResult.Rejected -> {
                    if (result.code == "unauthorized") {
                        mutableState.value =
                            mutableState.value.copy(
                                loading = false,
                                needsLogin = true,
                                message = "Sesi tidak berlaku. Masuk kembali untuk melanjutkan.",
                            )
                    } else {
                        store.clear()
                        mutableState.value =
                            CheckoutState(
                                loading = false,
                                quote = mutableState.value.quote,
                                needsProfile = result.code == "phone_required",
                                message = result.message,
                            )
                    }
                }
                CheckoutResult.Unknown ->
                    mutableState.value =
                        mutableState.value.copy(
                            loading = false,
                            message = "Hasil checkout belum diketahui. Coba lagi dengan data yang sama.",
                        )
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            mutableState.value =
                mutableState.value.copy(
                    loading = false,
                    unresolved = true,
                    message = "Hasil checkout belum diketahui. Coba lagi dengan data yang sama.",
                )
        }
    }

    private fun showOrder(timed: TimedOrder) {
        val reference = elapsedMillis()
        val initial =
            (
                timed.order.holdUntil.toInstant().toEpochMilli() -
                    timed.serverTime.toEpochMilli() - timed.roundTripMillis - 1000
            ).coerceAtLeast(0)
        mutableState.value = mutableState.value.copy(loading = false, order = timed, unresolved = true, message = null)
        timer?.cancel()
        timer =
            viewModelScope.launch {
                while (true) {
                    val remaining = (initial - (elapsedMillis() - reference)).coerceAtLeast(0) / 1000
                    mutableState.value = mutableState.value.copy(remainingSeconds = remaining)
                    if (remaining == 0L) break
                    delay(1000)
                }
            }
    }

    fun finish(): Boolean {
        if (mutableState.value.order == null || mutableState.value.loading) return false
        return try {
            store.clear()
            timer?.cancel()
            mutableState.value = CheckoutState(loading = false)
            true
        } catch (error: Exception) {
            mutableState.value = mutableState.value.copy(message = "Hasil belum dapat disimpan. Coba lagi.")
            false
        }
    }

    class Factory(
        private val productId: UUID,
        private val gateway: CheckoutGateway,
        private val store: CheckoutAttemptStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(CheckoutViewModel::class.java))
            return CheckoutViewModel(productId, gateway, store) as T
        }
    }

    companion object {
        const val KEY_LIFETIME_MILLIS = 24 * 60 * 60 * 1000L
        const val RETRY_LIMIT_MILLIS = KEY_LIFETIME_MILLIS - 2000
    }
}
