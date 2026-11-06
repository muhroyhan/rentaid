"use client";
import { useOrderHistoryDetails } from "../application/useOrderHistoryDetails";
import { orderCurrency, orderLabels, orderTime } from "../presentation";

export function OrderHistoryDetails({
  id,
  scope,
}: {
  id: string;
  scope: "renter" | "vendor";
}) {
  const { detail, error } = useOrderHistoryDetails({ id, scope });
  if (error) return <p role="alert">{error}</p>;
  if (!detail) return <p>Memuat detail pesanan...</p>;
  return (
    <section aria-label="Riwayat pesanan">
      <h3>Detail dan riwayat</h3>
      <p>
        Harga saat pemesanan: {orderCurrency.format(detail.order.dailyPrice)}{" "}
        per hari · {detail.order.quantity} barang
      </p>
      <p>Total: {orderCurrency.format(detail.order.total)}</p>
      {detail.renterName && (
        <p>
          Penyewa: {detail.renterName} · {detail.renterPhone}
        </p>
      )}
      {detail.payment ? (
        <p>
          Pembayaran simulasi:{" "}
          {detail.payment.status === "succeeded"
            ? "Berhasil"
            : detail.payment.status === "failed"
              ? "Gagal"
              : "Kedaluwarsa"}{" "}
          · {orderCurrency.format(detail.payment.amount)} ·{" "}
          {orderTime.format(new Date(detail.payment.createdAt))} WIB
        </p>
      ) : (
        <p>Belum ada pembayaran.</p>
      )}
      {detail.refund && (
        <p>
          Refund simulasi berhasil: {orderCurrency.format(detail.refund.amount)}{" "}
          · {orderTime.format(new Date(detail.refund.createdAt))} WIB
        </p>
      )}
      <h4>Riwayat status</h4>
      {detail.history.length === 0 ? (
        <p>Belum ada riwayat.</p>
      ) : (
        <ol>
          {detail.history.map((event) => (
            <li key={event.id}>
              {event.fromStatus ? `${orderLabels[event.fromStatus]} → ` : ""}
              {orderLabels[event.toStatus]} · {event.actorName} (
              {event.actorRole === "user"
                ? "Pengguna"
                : event.actorRole === "admin"
                  ? "Admin"
                  : "Sistem"}
              ) · {orderTime.format(new Date(event.createdAt))} WIB
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
