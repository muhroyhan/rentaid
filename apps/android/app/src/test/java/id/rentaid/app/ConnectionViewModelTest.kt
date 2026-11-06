package id.rentaid.app

import id.rentaid.app.connection.data.ConnectionRepository
import id.rentaid.app.connection.presentation.ConnectionState
import id.rentaid.app.connection.presentation.ConnectionViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class ConnectionViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun failureShowsErrorAndRetryReadsApi() =
        runTest(dispatcher) {
            var available = false
            val repository =
                object : ConnectionRepository {
                    override suspend fun check(): String {
                        if (!available) throw IOException("offline")
                        return "ok"
                    }
                }
            val model = ConnectionViewModel(repository)
            assertEquals(ConnectionState.Loading, model.state.value)
            advanceUntilIdle()
            assertEquals(ConnectionState.Unavailable, model.state.value)
            available = true
            model.refresh()
            assertEquals(ConnectionState.Loading, model.state.value)
            advanceUntilIdle()
            assertEquals(ConnectionState.Connected("ok"), model.state.value)
        }
}
