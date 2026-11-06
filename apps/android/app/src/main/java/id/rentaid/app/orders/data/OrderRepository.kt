package id.rentaid.app.orders.data

import id.rentaid.app.core.security.SessionStore
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.models.CancelInput
import id.rentaid.client.models.Order
import id.rentaid.client.models.OrderDetail
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.util.UUID

interface OrderRepository {
    suspend fun list(page: Int): List<Order>

    suspend fun detail(id: UUID): OrderDetail

    suspend fun cancel(
        id: UUID,
        expected: CancelInput.ExpectedStatus,
    )
}

class ApiOrderRepository(baseUrl: String, store: SessionStore) : OrderRepository {
    private val client =
        OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).addInterceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath
            val token = if (path == "/api/v1/orders" || path.startsWith("/api/v1/orders/")) store.read() else null
            chain.proceed(if (token != null) request.newBuilder().header("Authorization", "Bearer $token").build() else request)
        }.build()
    private val api = DefaultApi(baseUrl, client)

    override suspend fun list(page: Int): List<Order> = withContext(Dispatchers.IO) { api.listRenterOrders(page, PAGE_SIZE, null) }

    override suspend fun detail(id: UUID): OrderDetail = withContext(Dispatchers.IO) { api.getRenterOrderDetail(id) }

    override suspend fun cancel(
        id: UUID,
        expected: CancelInput.ExpectedStatus,
    ) {
        withContext(Dispatchers.IO) { api.cancelOrder(id, CancelInput(expected), null) }
    }

    companion object {
        const val PAGE_SIZE = 20
    }
}
