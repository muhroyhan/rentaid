import { currency, date, labels } from "../OrderDetails.model";
import { useOrderDetails } from "../application/useOrderDetails";

export function OrderDetails({
  id,
  onExpired,
}: {
  id: string;
  onExpired: () => void;
}) {
  const { detail, error } = useOrderDetails({ id, onExpired });
  if (error) return <p role="alert">{error}</p>;
  if (!detail) return <p>Memuat detail pesanan...</p>;
  return (
    <section aria-label="Riwayat pesanan">
      <h3>Detail dan riwayat</h3>
      <p>
        Penyewa: {detail.renterName} · {detail.renterPhone}
      </p>
      <p>
        Harga saat pemesanan: {currency.format(detail.order.dailyPrice)} per
        hari · {detail.order.quantity} barang · total{" "}
        {currency.format(detail.order.total)}
      </p>
      {detail.payment ? (
        <p>
          Pembayaran simulasi:{" "}
          {detail.payment.status === "succeeded"
            ? "Berhasil"
            : detail.payment.status === "failed"
              ? "Gagal"
              : "Kedaluwarsa"}{" "}
          · {currency.format(detail.payment.amount)} ·{" "}
          {date.format(new Date(detail.payment.createdAt))} WIB
        </p>
      ) : (
        <p>Belum ada pembayaran.</p>
      )}
      {detail.refund && (
        <p>
          Refund simulasi berhasil: {currency.format(detail.refund.amount)} ·{" "}
          {date.format(new Date(detail.refund.createdAt))} WIB
        </p>
      )}
      <h4>Riwayat status</h4>
      {detail.history.length === 0 ? (
        <p>Belum ada riwayat.</p>
      ) : (
        <ol>
          {detail.history.map((event) => (
            <li key={event.id}>
              {event.fromStatus ? `${labels[event.fromStatus]} → ` : ""}
              {labels[event.toStatus]} · {event.actorName} (
              {event.actorRole === "user"
                ? "Pengguna"
                : event.actorRole === "admin"
                  ? "Admin"
                  : "Sistem"}
              ) · {date.format(new Date(event.createdAt))} WIB
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
