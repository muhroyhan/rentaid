package id.rentaid.app

import id.rentaid.client.apis.DefaultApi
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class LocalApiTest {
    @Test
    fun readsLocalApiFromDevice() =
        runBlocking {
            assertEquals("ok", ApiConnectionRepository(DefaultApi(BuildConfig.API_BASE_URL)).check())
        }
}
