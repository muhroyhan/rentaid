package id.rentaid.app

import id.rentaid.app.catalog.data.ApiCatalogRepository
import id.rentaid.client.apis.DefaultApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class CatalogRepositoryTest {
    private val id = UUID.fromString("e947cb7e-5df8-4ea7-8e77-cab2ee13c289")

    @Test
    fun searchAndFilterUseServerParametersAndUnavailableIsEmpty() =
        runBlocking {
            MockWebServer().use { server ->
                server.enqueue(MockResponse().setBody("[]"))
                server.enqueue(MockResponse().setResponseCode(404).setBody("""{"code":"not_found","message":"Tidak ditemukan"}"""))
                server.enqueue(MockResponse().setResponseCode(404).setBody("""{"code":"not_found","message":"Tidak ditemukan"}"""))
                val repo = ApiCatalogRepository(DefaultApi(server.url("/").toString().trimEnd('/')))
                assertTrue(repo.products(2, " kamera sewa ", id).isEmpty())
                val request = server.takeRequest().requestUrl!!
                assertEquals("/api/v1/products", request.encodedPath)
                assertEquals("2", request.queryParameter("page"))
                assertEquals("20", request.queryParameter("page_size"))
                assertEquals("kamera sewa", request.queryParameter("q"))
                assertEquals(id.toString(), request.queryParameter("category_id"))
                assertNull(repo.product(id))
                assertNull(repo.content(DefaultApi.KeyGetPublicContent.faq))
            }
        }

    @Test
    fun apiFailureIsNotTreatedAsEmpty() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(500).setBody("""{"code":"internal_error","message":"Gagal"}"""))
            val repo = ApiCatalogRepository(DefaultApi(server.url("/").toString().trimEnd('/')))
            org.junit.Assert.assertThrows(Exception::class.java) { runBlocking { repo.products(1, "", null) } }
        }
    }
}
