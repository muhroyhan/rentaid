package id.rentaid.app

import id.rentaid.app.catalog.data.ApiCatalogRepository
import id.rentaid.client.apis.DefaultApi
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class CatalogApiIntegrationTest {
    @Test
    fun publicContentFilterPaginationAndUnpublishedProduct() =
        runBlocking {
            val repository = ApiCatalogRepository(DefaultApi(BuildConfig.API_BASE_URL))
            assertEquals("Beranda Uji", repository.content(DefaultApi.KeyGetPublicContent.home)?.title)
            assertEquals("FAQ Uji", repository.content(DefaultApi.KeyGetPublicContent.faq)?.title)
            val categories = repository.categories()
            val camera = categories.first { it.name == "Elektronik" }
            val outdoor = categories.first { it.name == "Peralatan Luar Ruang" }
            val first = repository.products(1, "Kamera Phase20", camera.id)
            val second = repository.products(2, "Kamera Phase20", camera.id)
            assertEquals(20, first.size)
            assertEquals(3, second.size)
            assertEquals(23, (first + second).map { it.id }.toSet().size)
            assertTrue(repository.products(1, "Kamera Phase20", outdoor.id).isEmpty())
            assertTrue(repository.products(1, "Produk tersembunyi Phase20", null).isEmpty())
            assertNull(repository.product(UUID.fromString("00000000-0000-4000-8000-000000000020")))
            val detail = repository.products(1, "Kamera Mirrorless", null).single()
            assertEquals(detail.id, repository.product(detail.id)?.id)
            assertFalse(detail.photoIds.isEmpty())
        }
}
