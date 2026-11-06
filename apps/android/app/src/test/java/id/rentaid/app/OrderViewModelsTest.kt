package id.rentaid.app

import id.rentaid.app.orders.data.OrderRepository
import id.rentaid.app.orders.presentation.OrderDetailViewModel
import id.rentaid.app.orders.presentation.OrderListViewModel
import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.models.CancelInput
import id.rentaid.client.models.Order
import id.rentaid.client.models.OrderDetail
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class OrderViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    private val id = UUID.randomUUID()
    private val time = OffsetDateTime.parse("2026-11-05T00:00:00Z")
    private val date = LocalDate.parse("2026-11-05")
    private val order =
        Order(
            id, "RNT-TEST", UUID.randomUUID(), "Kamera", "Toko", "Jakarta", date, date, 1, 10000, 10000,
            Order.Status.confirmed, time.plusMinutes(15), time,
        )

    private inner class Fake : OrderRepository {
        var detail = OrderDetail(order, emptyList())
        var error: Exception? = null
        var cancelError: Exception? = null
        var cancelCount = 0
        var expected: CancelInput.ExpectedStatus? = null
        val pages = mutableListOf<Int>()

        override suspend fun list(page: Int): List<Order> {
            error?.let { throw it }
            pages.add(page)
            return if (page == 1) {
                (0 until 20).map {
                    order.copy(
                        id = UUID.nameUUIDFromBytes(it.toString().toByteArray()),
                    )
                }
            } else {
                listOf(order)
            }
        }

        override suspend fun detail(id: UUID): OrderDetail {
            error?.let { throw it }
            return detail
        }

        override suspend fun cancel(
            id: UUID,
            expected: CancelInput.ExpectedStatus,
        ) {
            cancelCount++
            this.expected = expected
            cancelError?.let { throw it }
        }
    }

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun listPaginatesAndClearsPrivateDataWhenSessionExpires() =
        runTest(dispatcher) {
            val api = Fake()
            val model = OrderListViewModel(api)
            model.refresh()
            runCurrent()
            assertEquals(20, model.state.value.items.size)
            model.loadMore()
            runCurrent()
            assertEquals(listOf(1, 2), api.pages)
            assertEquals(21, model.state.value.items.size)
            api.error = ClientException(statusCode = 401)
            model.refresh()
            runCurrent()
            assertTrue(model.state.value.items.isEmpty())
            assertTrue(model.state.value.needsLogin)
        }

    @Test fun cancellationConflictRefreshesServerStatusAndPreventsLateCancellation() =
        runTest(dispatcher) {
            val api = Fake()
            val model = OrderDetailViewModel(api, id)
            model.refresh()
            runCurrent()
            api.cancelError = ClientException(statusCode = 409)
            api.detail = OrderDetail(order.copy(status = Order.Status.renting), emptyList())
            model.cancel()
            model.cancel()
            runCurrent()
            assertEquals(1, api.cancelCount)
            assertEquals(CancelInput.ExpectedStatus.confirmed, api.expected)
            assertEquals(Order.Status.renting, model.state.value.detail?.order?.status)
            model.cancel()
            runCurrent()
            assertEquals(1, api.cancelCount)
        }

    @Test fun pendingOrderCancellationUsesServerStatus() =
        runTest(dispatcher) {
            val api = Fake()
            api.detail = OrderDetail(order.copy(status = Order.Status.pending_payment), emptyList())
            val model = OrderDetailViewModel(api, id)
            model.refresh()
            runCurrent()
            api.detail = OrderDetail(order.copy(status = Order.Status.cancelled), emptyList())
            model.cancel()
            runCurrent()
            assertEquals(CancelInput.ExpectedStatus.pending_payment, api.expected)
            assertEquals(Order.Status.cancelled, model.state.value.detail?.order?.status)
            assertNull(model.state.value.detail?.refund)
        }

    @Test fun unknownCancellationResultIsCheckedAndSessionFailureHidesDetail() =
        runTest(dispatcher) {
            val api = Fake()
            val model = OrderDetailViewModel(api, id)
            model.refresh()
            runCurrent()
            api.cancelError = IOException()
            api.detail = OrderDetail(order.copy(status = Order.Status.cancelled), emptyList())
            model.cancel()
            runCurrent()
            assertEquals(Order.Status.cancelled, model.state.value.detail?.order?.status)
            assertTrue(model.state.value.message!!.contains("belum diketahui"))
            api.error = ClientException(statusCode = 401)
            model.refresh()
            runCurrent()
            assertNull(model.state.value.detail)
            assertTrue(model.state.value.needsLogin)
        }
}
