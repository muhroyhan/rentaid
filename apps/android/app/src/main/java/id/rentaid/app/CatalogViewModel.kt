package id.rentaid.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import id.rentaid.client.apis.DefaultApi
import id.rentaid.client.models.Category
import id.rentaid.client.models.Page
import id.rentaid.client.models.Product
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

data class CatalogState(
    val categories: List<Category> = emptyList(),
    val products: List<Product> = emptyList(),
    val query: String = "",
    val category: UUID? = null,
    val page: Int = 0,
    val hasMore: Boolean = false,
    val loading: Boolean = false,
    val error: Boolean = false,
    val categoryError: Boolean = false,
)

class CatalogViewModel(private val repository: CatalogRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CatalogState())
    val state = mutableState.asStateFlow()
    private var request: Job? = null

    init {
        refreshCategories()
        search("", null)
    }

    fun refreshCategories() {
        viewModelScope.launch {
            try {
                mutableState.value = mutableState.value.copy(categories = repository.categories(), categoryError = false)
            } catch (
                error: CancellationException,
            ) {
                throw error
            } catch (error: Exception) {
                mutableState.value = mutableState.value.copy(categoryError = true)
            }
        }
    }

    fun search(
        query: String,
        category: UUID?,
    ) {
        request?.cancel()
        mutableState.value = mutableState.value.copy(query = query, category = category, page = 0, products = emptyList(), hasMore = false)
        loadMore()
    }

    fun loadMore() {
        if (mutableState.value.loading && request?.isActive == true) return
        val current = mutableState.value
        if (current.page > 0 && !current.hasMore && !current.error) return
        mutableState.value = current.copy(loading = true, error = false)
        request =
            viewModelScope.launch {
                try {
                    val nextPage = current.page + 1
                    val items = repository.products(nextPage, current.query, current.category)
                    val existing = mutableState.value.products
                    mutableState.value =
                        mutableState.value.copy(
                            products = (existing + items).distinctBy { it.id },
                            page = nextPage,
                            hasMore = items.size == ApiCatalogRepository.PAGE_SIZE,
                            loading = false,
                        )
                } catch (
                    error: CancellationException,
                ) {
                    throw error
                } catch (error: Exception) {
                    mutableState.value = mutableState.value.copy(loading = false, error = true)
                }
            }
    }

    class Factory(private val repository: CatalogRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(CatalogViewModel::class.java))
            return CatalogViewModel(repository) as T
        }
    }
}

data class ResourceState<T>(val loading: Boolean = true, val value: T? = null, val error: Boolean = false)

class ContentViewModel(private val repository: CatalogRepository, private val key: DefaultApi.KeyGetPublicContent) : ViewModel() {
    private val mutableState = MutableStateFlow(ResourceState<Page>())
    val state = mutableState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        mutableState.value = ResourceState()
        viewModelScope.launch {
            try {
                mutableState.value = ResourceState(loading = false, value = repository.content(key))
            } catch (
                error: CancellationException,
            ) {
                throw error
            } catch (error: Exception) {
                mutableState.value = ResourceState(loading = false, error = true)
            }
        }
    }

    class Factory(private val repository: CatalogRepository, private val key: DefaultApi.KeyGetPublicContent) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(ContentViewModel::class.java))
            return ContentViewModel(repository, key) as T
        }
    }
}

class ProductViewModel(private val repository: CatalogRepository, private val id: UUID) : ViewModel() {
    private val mutableState = MutableStateFlow(ResourceState<Product>())
    val state = mutableState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        mutableState.value = ResourceState()
        viewModelScope.launch {
            try {
                mutableState.value = ResourceState(loading = false, value = repository.product(id))
            } catch (
                error: CancellationException,
            ) {
                throw error
            } catch (error: Exception) {
                mutableState.value = ResourceState(loading = false, error = true)
            }
        }
    }

    class Factory(private val repository: CatalogRepository, private val id: UUID) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(ProductViewModel::class.java))
            return ProductViewModel(repository, id) as T
        }
    }
}
