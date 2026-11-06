@file:Suppress("ktlint:standard:function-naming")

package id.rentaid.app.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import id.rentaid.app.BuildConfig
import id.rentaid.app.account.data.AccountRepository
import id.rentaid.app.account.presentation.AccountScreen
import id.rentaid.app.account.presentation.AccountViewModel
import id.rentaid.app.catalog.data.CatalogRepository
import id.rentaid.app.catalog.presentation.CatalogScreen
import id.rentaid.app.catalog.presentation.CatalogViewModel
import id.rentaid.app.catalog.presentation.ContentBody
import id.rentaid.app.catalog.presentation.ContentScreen
import id.rentaid.app.catalog.presentation.ContentViewModel
import id.rentaid.app.catalog.presentation.ProductScreen
import id.rentaid.app.catalog.presentation.ProductViewModel
import id.rentaid.app.checkout.data.CheckoutAttemptStore
import id.rentaid.app.checkout.data.CheckoutGateway
import id.rentaid.app.checkout.presentation.CheckoutScreen
import id.rentaid.app.checkout.presentation.CheckoutViewModel
import id.rentaid.app.connection.data.ConnectionRepository
import id.rentaid.app.connection.presentation.ConnectionScreen
import id.rentaid.app.connection.presentation.ConnectionViewModel
import id.rentaid.app.orders.data.OrderRepository
import id.rentaid.app.orders.presentation.OrderDetailScreen
import id.rentaid.app.orders.presentation.OrderDetailViewModel
import id.rentaid.app.orders.presentation.OrderListScreen
import id.rentaid.app.orders.presentation.OrderListViewModel
import id.rentaid.client.apis.DefaultApi
import java.util.UUID

@Composable
fun RentaidApp(
    repository: ConnectionRepository,
    accounts: AccountRepository? = null,
    catalog: CatalogRepository? = null,
    baseUrl: String = BuildConfig.API_BASE_URL,
    checkout: CheckoutGateway? = null,
    attempts: CheckoutAttemptStore? = null,
    orders: OrderRepository? = null,
) {
    val navigation = rememberNavController()
    NavHost(navController = navigation, startDestination = "home") {
        composable("home") {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Rentaid", style = MaterialTheme.typography.headlineMedium)
                Text("Selamat datang di Rentaid.")
                val pending = runCatching { attempts?.read() }.getOrNull()
                if (checkout != null && pending != null) {
                    Button(onClick = { navigation.navigate("checkout/${pending.input.productId}") }) { Text("Lanjutkan pesanan") }
                }
                if (catalog != null) {
                    val content: ContentViewModel =
                        viewModel(factory = ContentViewModel.Factory(catalog, DefaultApi.KeyGetPublicContent.home))
                    val contentState by content.state.collectAsStateWithLifecycle()
                    ContentBody(contentState, content::refresh, baseUrl)
                    Button(onClick = { navigation.navigate("catalog") }) { Text("Lihat katalog") }
                    listOf("faq" to "FAQ", "about" to "Tentang", "terms" to "Syarat penggunaan", "privacy" to "Kebijakan privasi").forEach {
                            (key, label) ->
                        Button(onClick = { navigation.navigate("content/$key") }) { Text(label) }
                    }
                }
                if (accounts != null) {
                    Button(onClick = { navigation.navigate("account") }) { Text("Akun dan profil") }
                }
                if (orders != null) Button(onClick = { navigation.navigate("orders") }) { Text("Pesanan saya") }
                Button(onClick = { navigation.navigate("connection") }) { Text("Periksa koneksi") }
            }
        }
        composable("catalog") {
            if (catalog != null) {
                val model: CatalogViewModel = viewModel(factory = CatalogViewModel.Factory(catalog))
                CatalogScreen(model, onProduct = { navigation.navigate("product/$it") }, onBack = { navigation.popBackStack() })
            }
        }
        composable("product/{id}") { entry ->
            val id = runCatching { UUID.fromString(entry.arguments?.getString("id")) }.getOrNull()
            if (catalog != null && id != null) {
                val model: ProductViewModel = viewModel(factory = ProductViewModel.Factory(catalog, id))
                ProductScreen(
                    model,
                    baseUrl,
                    onBack = { navigation.popBackStack() },
                    onCheckout =
                        if (checkout != null && attempts != null) {
                            { navigation.navigate("checkout/$id") }
                        } else {
                            null
                        },
                )
            } else {
                Column(Modifier.padding(24.dp)) {
                    Text("Produk tidak tersedia.")
                    Button(onClick = { navigation.popBackStack() }) { Text("Kembali") }
                }
            }
        }
        composable("checkout/{id}") { entry ->
            val id = runCatching { UUID.fromString(entry.arguments?.getString("id")) }.getOrNull()
            if (id != null && checkout != null && attempts != null) {
                val model: CheckoutViewModel = viewModel(factory = CheckoutViewModel.Factory(id, checkout, attempts))
                CheckoutScreen(model, onAccount = { navigation.navigate("account") }, onBack = { navigation.popBackStack() })
            }
        }
        composable("content/{key}") { entry ->
            val key = DefaultApi.KeyGetPublicContent.entries.firstOrNull { it.value == entry.arguments?.getString("key") }
            if (catalog != null && key != null) {
                val model: ContentViewModel = viewModel(factory = ContentViewModel.Factory(catalog, key))
                ContentScreen(model, baseUrl, onBack = { navigation.popBackStack() })
            }
        }
        composable("account") {
            if (accounts != null) {
                val model: AccountViewModel = viewModel(factory = AccountViewModel.Factory(accounts))
                AccountScreen(model, onBack = { navigation.popBackStack() })
            }
        }
        composable("orders") {
            if (orders != null) {
                val model: OrderListViewModel = viewModel(factory = OrderListViewModel.Factory(orders))
                OrderListScreen(
                    model,
                    { navigation.navigate("orders/$it") },
                    { navigation.navigate("account") },
                    { navigation.popBackStack() },
                )
            }
        }
        composable("orders/{id}") { entry ->
            val id = runCatching { UUID.fromString(entry.arguments?.getString("id")) }.getOrNull()
            if (orders != null && id != null) {
                val model: OrderDetailViewModel = viewModel(factory = OrderDetailViewModel.Factory(orders, id))
                OrderDetailScreen(model, { navigation.navigate("account") }, { navigation.popBackStack() })
            }
        }
        composable("connection") {
            val model: ConnectionViewModel = viewModel(factory = ConnectionViewModel.Factory(repository))
            val state by model.state.collectAsStateWithLifecycle()
            ConnectionScreen(state, onRetry = model::refresh, onBack = { navigation.popBackStack() })
        }
    }
}
