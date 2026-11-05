@file:Suppress("ktlint:standard:function-naming")

package id.rentaid.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.rentaid.client.models.Order
import java.text.NumberFormat
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private fun money(value: Long): String =
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("id-ID")).apply {
        maximumFractionDigits = 0
        minimumFractionDigits = 0
    }.format(value)

@Composable
fun CheckoutScreen(
    model: CheckoutViewModel,
    onAccount: () -> Unit,
    onBack: () -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    var start by rememberSaveable { mutableStateOf("") }
    var end by rememberSaveable { mutableStateOf("") }
    var quantity by rememberSaveable { mutableStateOf("1") }
    Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Rencanakan sewa", style = MaterialTheme.typography.headlineMedium)
        state.message?.let { Text(it) }
        if (state.loading) {
            CircularProgressIndicator()
            Text("Memproses…")
        }
        val order = state.order?.order
        if (order != null) {
            Text("Pesanan ${order.orderCode}", style = MaterialTheme.typography.titleLarge)
            Text(order.productName)
            Text("${order.startDate} sampai ${order.endDate} · ${order.quantity} barang")
            Text("Total ${money(order.total)}")
            Text("Status: ${order.status.value}")
            val until =
                order.holdUntil.atZoneSameInstant(
                    ZoneId.of("Asia/Jakarta"),
                ).format(DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm", Locale.forLanguageTag("id-ID")))
            Text("Batas hold: $until WIB")
            if (order.status == Order.Status.pending_payment) {
                state.remainingSeconds?.let { Text("Sisa hold: ${it / 60} menit ${it % 60} detik") }
                if (state.remainingSeconds == 0L) Text("Waktu hold telah habis. Status akhir ditentukan server.")
            }
            Button(onClick = { if (model.finish()) onBack() }, enabled = !state.loading) { Text("Selesai") }
        } else if (state.unresolved) {
            Text("Selesaikan pemeriksaan checkout sebelumnya sebelum memulai checkout baru.")
            Button(onClick = model::resume, enabled = !state.loading && state.pending != null) { Text("Periksa dan coba lagi") }
        } else {
            OutlinedTextField(start, {
                start = it
                model.invalidateQuote()
            }, label = {
                Text(
                    "Tanggal mulai (YYYY-MM-DD)",
                )
            }, enabled = !state.loading, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(end, {
                end = it
                model.invalidateQuote()
            }, label = {
                Text(
                    "Tanggal selesai (YYYY-MM-DD)",
                )
            }, enabled = !state.loading, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(
                quantity,
                {
                    quantity = it
                    model.invalidateQuote()
                },
                label = {
                    Text("Jumlah barang")
                },
                enabled = !state.loading,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions =
                    KeyboardOptions(
                        keyboardType = KeyboardType.Number,
                    ),
                singleLine = true,
            )
            Button(onClick = { model.getQuote(start, end, quantity) }, enabled = !state.loading) { Text("Lihat penawaran") }
            state.quote?.let { quote ->
                Text("Ringkasan penawaran", style = MaterialTheme.typography.titleLarge)
                Text("${money(quote.dailyPrice)} × ${quote.days} hari × ${quote.quantity} barang")
                Text("Tersedia untuk tanggal ini: ${quote.available}")
                Text("Total ${money(quote.total)}")
                Text("Penawaran ini belum menahan stok.")
                Button(
                    onClick = model::submit,
                    enabled = !state.loading && quote.available >= quote.quantity,
                ) { Text("Lanjut ke checkout") }
            }
        }
        if (state.needsLogin || state.needsProfile) {
            Button(onClick = onAccount, enabled = !state.loading) { Text(if (state.needsProfile) "Lengkapi profil" else "Masuk") }
        }
        Button(onClick = onBack, enabled = !state.loading) { Text("Kembali") }
    }
}
