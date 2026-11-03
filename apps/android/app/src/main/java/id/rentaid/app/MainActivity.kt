package id.rentaid.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repository = ApiConnectionRepository(DefaultApi(BuildConfig.API_BASE_URL))
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    RentaidApp(repository)
                }
            }
        }
    }
}

@Composable
fun RentaidApp(repository: ConnectionRepository) {
    val navigation = rememberNavController()
    NavHost(navController = navigation, startDestination = "home") {
        composable("home") {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Rentaid", style = MaterialTheme.typography.headlineMedium)
                Text("Selamat datang di Rentaid.")
                Button(onClick = { navigation.navigate("connection") }) { Text("Periksa koneksi") }
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
fun ConnectionScreen(state: ConnectionState, onRetry: () -> Unit, onBack: () -> Unit) {
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
