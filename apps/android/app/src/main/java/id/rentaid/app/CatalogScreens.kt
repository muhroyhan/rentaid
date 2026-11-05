@file:Suppress("ktlint:standard:function-naming")

package id.rentaid.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.rentaid.client.models.Page
import id.rentaid.client.models.Product
import java.text.NumberFormat
import java.util.Locale
import java.util.UUID

private fun rupiah(value: Long): String =
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("id-ID")).apply {
        maximumFractionDigits = 0
        minimumFractionDigits = 0
    }.format(value)

@Composable
fun ContentBody(
    state: ResourceState<Page>,
    onRetry: () -> Unit,
    baseUrl: String,
) {
    when {
        state.loading -> CircularProgressIndicator()
        state.error -> {
            Text("Konten tidak dapat dimuat.")
            Button(onClick = onRetry) { Text("Coba lagi") }
        }
        state.value == null -> Text("Konten belum tersedia.")
        else -> {
            Text(state.value.title, style = MaterialTheme.typography.headlineSmall)
            state.value.imageId?.let { PublicImage(baseUrl, it, "Gambar konten") }
            Text(state.value.body)
        }
    }
}

@Composable
fun ContentScreen(
    model: ContentViewModel,
    baseUrl: String,
    onBack: () -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ContentBody(state, model::refresh, baseUrl)
        Button(onClick = onBack) { Text("Kembali") }
    }
}

@Composable
fun CatalogScreen(
    model: CatalogViewModel,
    onProduct: (UUID) -> Unit,
    onBack: () -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf(state.query) }
    var categoriesVisible by remember { mutableStateOf(false) }
    LazyColumn(Modifier.testTag("catalog_list").padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Katalog", style = MaterialTheme.typography.headlineMedium) }
        item {
            OutlinedTextField(query, { query = it }, label = { Text("Cari produk") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        }
        item { Button(onClick = { model.search(query, state.category) }) { Text("Cari") } }
        item {
            val selected = state.categories.firstOrNull { it.id == state.category }?.name ?: "Semua kategori"
            Button(onClick = { categoriesVisible = !categoriesVisible }) { Text("Kategori: $selected") }
        }
        if (state.categoryError) {
            item {
                Text("Kategori tidak dapat dimuat.")
                Button(onClick = model::refreshCategories) { Text("Coba lagi kategori") }
            }
        }
        if (categoriesVisible) {
            item {
                Text(
                    "Semua kategori",
                    Modifier.fillMaxWidth().clickable {
                        model.search(query, null)
                        categoriesVisible = false
                    }.padding(8.dp),
                )
            }
            items(state.categories, key = { it.id.toString() }) { category ->
                Text(
                    category.name,
                    Modifier.fillMaxWidth().clickable {
                        model.search(query, category.id)
                        categoriesVisible = false
                    }.padding(8.dp),
                )
            }
        }
        items(state.products, key = { it.id.toString() }) { product ->
            Column(
                Modifier.testTag("product_${product.id}").fillMaxWidth().clickable { onProduct(product.id) }.padding(vertical = 8.dp),
            ) {
                Text(product.name, style = MaterialTheme.typography.titleMedium)
                Text("${rupiah(product.dailyPrice)} / hari")
                Text("${product.categoryName} · ${product.storeName}")
            }
        }
        if (!state.loading && state.products.isEmpty() && !state.error) item { Text("Tidak ada produk ditemukan.") }
        if (state.loading) {
            item {
                CircularProgressIndicator()
                Text("Memuat produk…")
            }
        }
        if (state.error) {
            item {
                Text("Produk tidak dapat dimuat.")
                Button(onClick = model::loadMore) { Text("Coba lagi") }
            }
        }
        if (state.hasMore && !state.loading && !state.error) item { Button(onClick = model::loadMore) { Text("Muat lebih banyak") } }
        item { Button(onClick = onBack) { Text("Kembali") } }
    }
}

@Composable
fun ProductScreen(
    model: ProductViewModel,
    baseUrl: String,
    onBack: () -> Unit,
    onCheckout: (() -> Unit)? = null,
) {
    val state by model.state.collectAsStateWithLifecycle()
    Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when {
            state.loading -> CircularProgressIndicator()
            state.error -> {
                Text("Produk tidak dapat dimuat.")
                Button(onClick = model::refresh) { Text("Coba lagi") }
            }
            state.value == null -> Text("Produk tidak tersedia.")
            else ->
                state.value?.let {
                    ProductDetails(it, baseUrl)
                    if (onCheckout != null) {
                        Button(onClick = onCheckout) { Text("Rencanakan sewa") }
                    }
                }
        }
        Button(onClick = onBack) { Text("Kembali") }
    }
}

@Composable
private fun ProductDetails(
    product: Product,
    baseUrl: String,
) {
    Text(product.name, style = MaterialTheme.typography.headlineMedium)
    if (product.photoIds.isEmpty()) Text("Tidak ada foto produk.")
    product.photoIds.forEachIndexed { index, id -> PublicImage(baseUrl, id, "Foto produk ${index + 1}") }
    Text("${rupiah(product.dailyPrice)} / hari", style = MaterialTheme.typography.titleLarge)
    Text(product.description)
    Text("Kategori: ${product.categoryName}")
    Text("Stok: ${product.stock}")
    Text("Toko: ${product.storeName}")
    Text("Alamat: ${product.storeAddress}")
}
