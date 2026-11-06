@file:Suppress("ktlint:standard:function-naming")

package id.rentaid.app.connection.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

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
