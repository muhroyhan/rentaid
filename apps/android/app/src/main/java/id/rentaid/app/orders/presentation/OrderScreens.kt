@file:Suppress("ktlint:standard:function-naming")

package id.rentaid.app.orders.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.rentaid.client.models.Order
import java.text.NumberFormat
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

private fun orderStatus(status: String): String =
    when (status) {
        "pending_payment" -> "Menunggu pembayaran"
        "confirmed" -> "Terkonfirmasi"
        "renting" -> "Sedang disewa"
        "completed" -> "Selesai"
        "cancelled" -> "Dibatalkan"
        "expired" -> "Kedaluwarsa"
        "payment_failed" -> "Pembayaran gagal"
        "succeeded" -> "Berhasil"
        "failed" -> "Gagal"
        else -> status
    }

private fun orderMoney(amount: Long): String =
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("id-ID")).apply {
        maximumFractionDigits = 0
        minimumFractionDigits = 0
    }.format(amount)

private fun orderTime(time: OffsetDateTime): String =
    time.atZoneSameInstant(ZoneId.of("Asia/Jakarta"))
        .format(DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm", Locale.forLanguageTag("id-ID"))) + " WIB"

@Composable
private fun RefreshOnResume(refresh: () -> Unit) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val latestRefresh by rememberUpdatedState(refresh)
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) latestRefresh() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
}

@Composable
fun OrderListScreen(
    model: OrderListViewModel,
    onOrder: (UUID) -> Unit,
    onAccount: () -> Unit,
    onBack: () -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    RefreshOnResume(model::refresh)
    LazyColumn(Modifier.padding(24.dp).testTag("order_list"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Pesanan saya", style = MaterialTheme.typography.headlineMedium) }
        item { Button(onClick = model::refresh, enabled = !state.loading) { Text("Muat ulang") } }
        state.message?.let { item { Text(it) } }
        if (state.needsLogin) item { Button(onClick = onAccount) { Text("Masuk") } }
        if (!state.loading && state.message == null && state.items.isEmpty()) item { Text("Belum ada pesanan.") }
        items(state.items, key = { it.id.toString() }) { order ->
            Column(Modifier.fillMaxWidth().testTag("order_${order.id}").clickable { onOrder(order.id) }.padding(8.dp)) {
                Text(order.orderCode, style = MaterialTheme.typography.titleMedium)
                Text(order.productName)
                Text("${order.startDate} sampai ${order.endDate} · ${orderMoney(order.total)}")
                Text(orderStatus(order.status.value))
            }
        }
        if (state.loading) item { CircularProgressIndicator() }
        if (!state.loading && !state.needsLogin && (state.hasMore || (state.message != null && state.page > 0))) {
            item { Button(onClick = model::loadMore) { Text("Muat lebih banyak") } }
        }
        if (!state.loading && state.message != null && !state.needsLogin && state.page == 0) {
            item { Button(onClick = model::refresh) { Text("Coba lagi") } }
        }
        item { Button(onClick = onBack) { Text("Kembali") } }
    }
}

@Composable
fun OrderDetailScreen(
    model: OrderDetailViewModel,
    onAccount: () -> Unit,
    onBack: () -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    var confirm by rememberSaveable { mutableStateOf(false) }
    RefreshOnResume(model::refresh)
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Batalkan pesanan?") },
            text = { Text("Pesanan terkonfirmasi akan menerima refund simulasi penuh. Pembatalan tidak dapat dibatalkan kembali.") },
            confirmButton = {
                TextButton(onClick = {
                    confirm = false
                    model.cancel()
                }) { Text("Ya, batalkan") }
            },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Kembali") } },
        )
    }
    Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Detail pesanan", style = MaterialTheme.typography.headlineMedium)
        if (state.loading) CircularProgressIndicator()
        state.message?.let { Text(it) }
        if (state.needsLogin) Button(onClick = onAccount) { Text("Masuk") }
        state.detail?.let { detail ->
            val order = detail.order
            Text(order.orderCode, style = MaterialTheme.typography.titleLarge)
            Text("Status: ${orderStatus(order.status.value)}")
            Text(order.productName)
            Text("${order.storeName} · ${order.storeAddress}")
            Text("${order.startDate} sampai ${order.endDate} · ${order.quantity} barang")
            Text("Harga harian ${orderMoney(order.dailyPrice)}")
            Text("Total ${orderMoney(order.total)}")
            order.returnedAt?.let { Text("Dikembalikan: ${orderTime(it)}") }
            Text("Pembayaran", style = MaterialTheme.typography.titleMedium)
            detail.payment?.let { Text("${orderStatus(it.status)} · ${orderMoney(it.amount)} · ${orderTime(it.createdAt)}") }
                ?: Text("Belum ada pembayaran.")
            Text("Refund simulasi", style = MaterialTheme.typography.titleMedium)
            detail.refund?.let { Text("${orderStatus(it.status)} · ${orderMoney(it.amount)} · ${orderTime(it.createdAt)}") }
                ?: Text("Belum ada refund.")
            Text("Riwayat status", style = MaterialTheme.typography.titleMedium)
            detail.history.forEach { event ->
                Text("${orderStatus(event.toStatus.value)} · ${event.actorName} · ${orderTime(event.createdAt)}")
            }
            if (order.status == Order.Status.pending_payment || order.status == Order.Status.confirmed) {
                Button(onClick = { confirm = true }, enabled = !state.loading) { Text("Batalkan pesanan") }
            }
        }
        Button(onClick = model::refresh, enabled = !state.loading) { Text("Muat ulang") }
        Button(onClick = onBack) { Text("Kembali") }
    }
}
