import { createApiClient, type components } from "@rentaid/api-client";
import { useEffect, useState } from "react";
const api = createApiClient(window.location.origin);
type Detail = components["schemas"]["OrderDetail"];
const labels: Record<components["schemas"]["Order"]["status"], string> = {
  pending_payment: "Menunggu pembayaran",
  confirmed: "Terkonfirmasi",
  renting: "Sedang disewa",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
  payment_failed: "Pembayaran gagal",
};
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const date = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});
export function OrderDetails({
  id,
  onExpired,
}: {
  id: string;
  onExpired: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await api.GET("/api/v1/admin/orders/{id}", {
          params: { path: { id } },
        });
        if (!active) return;
        if (result.response.status === 401) {
          onExpired();
          return;
        }
        if (!result.data) throw new Error();
        setDetail(result.data);
      } catch {
        if (active) setError("Detail pesanan tidak dapat dimuat.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id, onExpired]);
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
