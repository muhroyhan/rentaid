package id.rentaid.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import id.rentaid.app.catalog.data.CatalogRepository
import id.rentaid.app.connection.data.ApiConnectionRepository
import id.rentaid.app.navigation.RentaidApp
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.models.Category
import id.rentaid.client.models.Page
import id.rentaid.client.models.Product
import org.junit.Rule
import org.junit.Test
import java.io.IOException
import java.util.UUID

class CatalogFailureUiTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun apiFailureShowsRetryWithoutCrashing() {
        val failing =
            object : CatalogRepository {
                override suspend fun content(key: DefaultApi.KeyGetPublicContent): Page = throw IOException()

                override suspend fun categories(): List<Category> = throw IOException()

                override suspend fun products(
                    page: Int,
                    query: String,
                    category: UUID?,
                ): List<Product> = throw IOException()

                override suspend fun product(id: UUID): Product = throw IOException()
            }
        compose.setContent { RentaidApp(ApiConnectionRepository(DefaultApi("http://127.0.0.1:1")), catalog = failing) }
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Konten tidak dapat dimuat.")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Konten tidak dapat dimuat.").assertIsDisplayed()
        compose.onNodeWithText("Lihat katalog").performClick()
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Produk tidak dapat dimuat.")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Produk tidak dapat dimuat.").assertIsDisplayed()
        compose.onNodeWithText("Coba lagi", substring = false).assertIsDisplayed()
    }
}
