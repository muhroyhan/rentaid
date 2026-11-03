"use client";
import { useEffect, useState } from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../lib/api";
import { orderCurrency, orderLabels, orderTime } from "../lib/orders";
type Detail = components["schemas"]["OrderDetail"];
export function OrderHistoryDetails({
  id,
  scope,
}: {
  id: string;
  scope: "renter" | "vendor";
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result =
          scope === "renter"
            ? await api.GET("/api/v1/orders/{id}/detail", {
                params: { path: { id } },
                cache: "no-store",
              })
            : await api.GET("/api/v1/vendor/orders/{id}", {
                params: { path: { id } },
                cache: "no-store",
              });
        if (active) {
          if (result.data) setDetail(result.data);
          else
            setError(
              result.error?.message ?? "Detail pesanan tidak dapat dimuat.",
            );
        }
      } catch {
        if (active) setError("Detail pesanan tidak dapat dimuat.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id, scope]);
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
