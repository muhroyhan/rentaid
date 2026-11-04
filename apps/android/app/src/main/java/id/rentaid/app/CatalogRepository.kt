package id.rentaid.app

import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.infrastructure.ClientException
import id.rentaid.client.models.Category
import id.rentaid.client.models.Page
import id.rentaid.client.models.Product
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID

interface CatalogRepository {
    suspend fun content(key: DefaultApi.KeyGetPublicContent): Page?

    suspend fun categories(): List<Category>

    suspend fun products(
        page: Int,
        query: String,
        category: UUID?,
    ): List<Product>

    suspend fun product(id: UUID): Product?
}

class ApiCatalogRepository(private val api: DefaultApi) : CatalogRepository {
    override suspend fun content(key: DefaultApi.KeyGetPublicContent): Page? =
        withContext(Dispatchers.IO) {
            try {
                api.getPublicContent(key)
            } catch (error: ClientException) {
                if (error.statusCode == 404) null else throw error
            }
        }

    override suspend fun categories(): List<Category> =
        withContext(Dispatchers.IO) {
            val result = mutableListOf<Category>()
            var page = 1
            do {
                val items = api.listCategories(page, PAGE_SIZE)
                result.addAll(items)
                page++
            } while (items.size == PAGE_SIZE)
            result.distinctBy { it.id }
        }

    override suspend fun products(
        page: Int,
        query: String,
        category: UUID?,
    ): List<Product> = withContext(Dispatchers.IO) { api.listPublicProducts(page, PAGE_SIZE, query.trim().ifEmpty { null }, category) }

    override suspend fun product(id: UUID): Product? =
        withContext(Dispatchers.IO) {
            try {
                api.getPublicProduct(id)
            } catch (error: ClientException) {
                if (error.statusCode == 404 || error.statusCode == 400) null else throw error
            }
        }

    companion object {
        const val PAGE_SIZE = 20
    }
}
