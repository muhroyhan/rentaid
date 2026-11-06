package id.rentaid.app

import id.rentaid.app.catalog.data.CatalogRepository
import id.rentaid.app.catalog.presentation.CatalogViewModel
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.models.Category
import id.rentaid.client.models.Page
import id.rentaid.client.models.Product
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.OffsetDateTime
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class CatalogViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val category = UUID.randomUUID()
    private val now = OffsetDateTime.parse("2026-01-01T00:00:00Z")

    private fun fixtureProduct(id: UUID) =
        Product(id, id, "Toko", category, "Kamera", "Produk", "Deskripsi", 12000, 2, emptySet(), true, false, false, now, now, "Jakarta")

    @Before fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test fun paginationDeduplicatesAndNewFilterResetsPage() =
        runTest(dispatcher) {
            val ids = List(20) { UUID.randomUUID() }
            val requests = mutableListOf<Triple<Int, String, UUID?>>()
            val repo =
                object : CatalogRepository {
                    override suspend fun content(key: DefaultApi.KeyGetPublicContent): Page? = null

                    override suspend fun categories(): List<Category> = emptyList()

                    override suspend fun product(id: UUID): Product? = null

                    override suspend fun products(
                        page: Int,
                        query: String,
                        category: UUID?,
                    ): List<Product> {
                        requests.add(Triple(page, query, category))
                        return if (query == "kamera") {
                            listOf(fixtureProduct(ids.first()))
                        } else if (page == 1) {
                            ids.map(::fixtureProduct)
                        } else {
                            listOf(fixtureProduct(ids.first()), fixtureProduct(UUID.randomUUID()))
                        }
                    }
                }
            val model = CatalogViewModel(repo)
            advanceUntilIdle()
            assertTrue(model.state.value.hasMore)
            model.loadMore()
            advanceUntilIdle()
            assertEquals(21, model.state.value.products.size)
            assertFalse(model.state.value.hasMore)
            model.search("kamera", category)
            advanceUntilIdle()
            assertEquals(1, model.state.value.products.size)
            assertEquals(Triple(1, "kamera", category), requests.last())
        }
}
