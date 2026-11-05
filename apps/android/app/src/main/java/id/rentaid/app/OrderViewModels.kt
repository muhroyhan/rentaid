package id.rentaid.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.models.CancelInput
import id.rentaid.client.models.Order
import id.rentaid.client.models.OrderDetail
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

data class OrderListState(
    val items: List<Order> = emptyList(),
    val page: Int = 0,
    val hasMore: Boolean = false,
    val loading: Boolean = false,
    val message: String? = null,
    val needsLogin: Boolean = false,
)

class OrderListViewModel(private val repository: OrderRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(OrderListState())
    val state = mutableState.asStateFlow()
    private var request: Job? = null

    fun refresh() {
        request?.cancel()
        mutableState.value = OrderListState()
        loadMore()
    }

    fun loadMore() {
        val current = mutableState.value
        if (current.loading || (current.page > 0 && !current.hasMore)) return
        mutableState.value = current.copy(loading = true, message = null, needsLogin = false)
        request =
            viewModelScope.launch {
                try {
                    val nextPage = current.page + 1
                    val items = repository.list(nextPage)
                    mutableState.value =
                        current.copy(
                            items = (current.items + items).distinctBy { it.id }, page = nextPage,
                            hasMore = items.size == ApiOrderRepository.PAGE_SIZE, loading = false,
                        )
                } catch (error: CancellationException) {
                    throw error
                } catch (error: ClientException) {
                    mutableState.value =
                        if (error.statusCode == 401) {
                            OrderListState(needsLogin = true, message = "Silakan masuk untuk melihat pesanan.")
                        } else {
                            current.copy(loading = false, message = "Pesanan tidak dapat dimuat. Coba lagi.")
                        }
                } catch (error: Exception) {
                    mutableState.value =
                        current.copy(loading = false, message = "Pesanan tidak dapat dimuat. Periksa koneksi dan coba lagi.")
                }
            }
    }

    class Factory(private val repository: OrderRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(OrderListViewModel::class.java))
            return OrderListViewModel(repository) as T
        }
    }
}

data class OrderDetailState(
    val detail: OrderDetail? = null,
    val loading: Boolean = false,
    val message: String? = null,
    val needsLogin: Boolean = false,
)

class OrderDetailViewModel(private val repository: OrderRepository, private val id: UUID) : ViewModel() {
    private val mutableState = MutableStateFlow(OrderDetailState())
    val state = mutableState.asStateFlow()
    private var request: Job? = null

    fun refresh() {
        request?.cancel()
        mutableState.value = OrderDetailState(loading = true)
        request = viewModelScope.launch { load() }
    }

    private suspend fun load(notice: String? = null) {
        try {
            mutableState.value = OrderDetailState(detail = repository.detail(id), message = notice)
        } catch (error: CancellationException) {
            throw error
        } catch (error: ClientException) {
            mutableState.value =
                OrderDetailState(
                    needsLogin = error.statusCode == 401,
                    message =
                        when (error.statusCode) {
                            401 -> "Silakan masuk untuk melihat pesanan."
                            404 -> "Pesanan tidak ditemukan."
                            else -> notice ?: "Pesanan tidak dapat dimuat. Coba lagi."
                        },
                )
        } catch (error: Exception) {
            mutableState.value = OrderDetailState(message = notice ?: "Pesanan tidak dapat dimuat. Periksa koneksi dan coba lagi.")
        }
    }

    fun cancel() {
        val current = mutableState.value
        if (current.loading) return
        val expected =
            when (current.detail?.order?.status) {
                Order.Status.pending_payment -> CancelInput.ExpectedStatus.pending_payment
                Order.Status.confirmed -> CancelInput.ExpectedStatus.confirmed
                else -> return
            }
        mutableState.value = current.copy(loading = true, message = null)
        request =
            viewModelScope.launch {
                val notice =
                    try {
                        repository.cancel(id, expected)
                        "Pembatalan berhasil."
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: ClientException) {
                        if (error.statusCode == 401) {
                            mutableState.value = OrderDetailState(needsLogin = true, message = "Silakan masuk kembali.")
                            return@launch
                        }
                        if (error.statusCode == 409) {
                            "Status pesanan telah berubah. Periksa status terbaru."
                        } else {
                            "Pembatalan belum berhasil."
                        }
                    } catch (error: Exception) {
                        "Hasil pembatalan belum diketahui. Periksa status terbaru."
                    }
                load(notice)
            }
    }

    class Factory(private val repository: OrderRepository, private val id: UUID) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(OrderDetailViewModel::class.java))
            return OrderDetailViewModel(repository, id) as T
        }
    }
}
