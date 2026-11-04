package id.rentaid.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import id.rentaid.client.apis.DefaultApi
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test

class CatalogUiIntegrationTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun publishedFaqCanBeOpenedFromHome() {
        val api = DefaultApi(BuildConfig.API_BASE_URL)
        compose.setContent { RentaidApp(ApiConnectionRepository(api), catalog = ApiCatalogRepository(api)) }
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Beranda Uji")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("FAQ").performScrollTo().performClick()
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("FAQ Uji")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Jawaban dari CMS").assertIsDisplayed()
    }

    @Test
    fun categoryFilterAndNextPageCanBeUsed() {
        val api = DefaultApi(BuildConfig.API_BASE_URL)
        compose.setContent { RentaidApp(ApiConnectionRepository(api), catalog = ApiCatalogRepository(api)) }
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Beranda Uji")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Lihat katalog").performClick()
        compose.onNodeWithText("Cari produk").performTextInput("Kamera Phase20")
        compose.onNodeWithText("Kategori: Semua kategori").performClick()
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Elektronik")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Elektronik").performClick()
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Kamera Phase20", substring = true)).fetchSemanticsNodes().size > 1 }
        compose.onNodeWithTag("catalog_list").performScrollToNode(hasText("Muat lebih banyak"))
        compose.onNodeWithText("Muat lebih banyak").performClick()
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Muat lebih banyak")).fetchSemanticsNodes().isEmpty() }
    }

    @Test
    fun contentSearchProductDetailAndBrokenImage() {
        val api = DefaultApi(BuildConfig.API_BASE_URL)
        val productId = runBlocking { ApiCatalogRepository(api).products(1, "Kamera Mirrorless", null).single().id }
        compose.setContent { RentaidApp(ApiConnectionRepository(api), catalog = ApiCatalogRepository(api)) }
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Beranda Uji")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Lihat katalog").performClick()
        compose.onNodeWithText("Cari produk").performTextInput("Kamera Mirrorless")
        compose.onNodeWithText("Cari", substring = false).performClick()
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Kamera Mirrorless")).fetchSemanticsNodes().isNotEmpty() }
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Kamera Mirrorless")).fetchSemanticsNodes().size > 1 }
        compose.onNodeWithTag("product_$productId").performClick()
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Toko: Toko Demo approved")).fetchSemanticsNodes().isNotEmpty() }
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Gambar tidak tersedia")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Gambar tidak tersedia").assertIsDisplayed()
        compose.onNodeWithText("Alamat: Jakarta").assertIsDisplayed()
    }
}
