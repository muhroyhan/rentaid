@file:Suppress("ktlint:standard:function-naming")

package id.rentaid.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import id.rentaid.client.apis.DefaultApi
import java.util.UUID

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repository = ApiConnectionRepository(DefaultApi(BuildConfig.API_BASE_URL))
        val accounts = ApiAccountRepository(BuildConfig.API_BASE_URL, KeystoreSessionStore(applicationContext))
        val catalog = ApiCatalogRepository(DefaultApi(BuildConfig.API_BASE_URL))
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    RentaidApp(repository, accounts, catalog)
                }
            }
        }
    }
}

@Composable
fun RentaidApp(
    repository: ConnectionRepository,
    accounts: AccountRepository? = null,
    catalog: CatalogRepository? = null,
    baseUrl: String = BuildConfig.API_BASE_URL,
) {
    val navigation = rememberNavController()
    NavHost(navController = navigation, startDestination = "home") {
        composable("home") {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Rentaid", style = MaterialTheme.typography.headlineMedium)
                Text("Selamat datang di Rentaid.")
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
                ProductScreen(model, baseUrl, onBack = { navigation.popBackStack() })
            } else {
                Column(Modifier.padding(24.dp)) {
                    Text("Produk tidak tersedia.")
                    Button(onClick = { navigation.popBackStack() }) { Text("Kembali") }
                }
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
        composable("connection") {
            val model: ConnectionViewModel = viewModel(factory = ConnectionViewModel.Factory(repository))
            val state by model.state.collectAsStateWithLifecycle()
            ConnectionScreen(state, onRetry = model::refresh, onBack = { navigation.popBackStack() })
        }
    }
}

@Composable
fun ConnectionScreen(
    state: ConnectionState,
    onRetry: () -> Unit,
    onBack: () -> Unit,
) {
    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Koneksi API", style = MaterialTheme.typography.headlineMedium)
        when (state) {
            ConnectionState.Loading -> {
                CircularProgressIndicator()
                Text("Memeriksa koneksi…")
            }
            is ConnectionState.Connected -> Text("Terhubung ke API. Status: ${state.status}")
            ConnectionState.Unavailable -> Text("API tidak dapat dihubungi. Periksa koneksi dan coba lagi.")
        }
        if (state != ConnectionState.Loading) {
            Button(onClick = onRetry) { Text("Coba lagi") }
        }
        Button(onClick = onBack) { Text("Kembali") }
    }
}
