"use client";
import { useCallback, useEffect, useState } from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../lib/api";
import { CancelOrderButton } from "./CancelOrderButton";
type Order = components["schemas"]["VendorOrder"];
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const labels: Record<Order["status"], string> = {
  pending_payment: "Menunggu pembayaran",
  confirmed: "Terkonfirmasi",
  renting: "Sedang disewa",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
  payment_failed: "Pembayaran gagal",
};
export function VendorOrders() {
  const [items, setItems] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [handoverBusy, setHandoverBusy] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await api.GET("/api/v1/vendor/orders", {
        params: { query: { page, page_size: 20 } },
        cache: "no-store",
      });
      if (result.data) {
        setItems(result.data);
        setError("");
      } else setError(result.error?.message ?? "Pesanan tidak dapat dimuat.");
    } catch {
      setError("Pesanan tidak dapat dimuat.");
    }
  }, [page]);
  async function handover(id: string) {
    if (handoverBusy) return;
    setHandoverBusy(id);
    setError("");
    try {
      const session = await api.GET("/api/v1/auth/session", {
        cache: "no-store",
      });
      if (!session.data) {
        setError("Silakan masuk kembali.");
        return;
      }
      const result = await api.POST("/api/v1/vendor/orders/{id}/handover", {
        params: { path: { id } },
        headers: { "X-CSRF-Token": session.data.csrfToken },
      });
      if (!result.data) {
        setError(result.error?.message ?? "Serah terima tidak berhasil.");
        return;
      }
      await load();
    } catch {
      setError("Serah terima tidak berhasil. Coba lagi.");
    } finally {
      setHandoverBusy("");
    }
  }
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="surface vendor-orders" aria-label="Pesanan masuk">
      <span className="eyebrow">PESANAN MASUK</span>
      <h2>Pesanan toko</h2>
      {error && <p role="alert">{error}</p>}
      {!error && items.length === 0 ? (
        <p>Belum ada pesanan pada halaman ini.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>
                {item.orderCode} · {item.productName}
              </strong>
              <p>
                {item.renterName} · {item.renterPhone}
              </p>
              <p>
                {item.startDate} — {item.endDate} · {item.quantity} barang ·{" "}
                {currency.format(item.total)}
              </p>
              <p>Status: {labels[item.status]}</p>
              {item.refundAmount > 0 && (
                <p>
                  Refund simulasi berhasil: {currency.format(item.refundAmount)}
                </p>
              )}
              {item.status === "confirmed" && (
                <button
                  type="button"
                  disabled={handoverBusy !== ""}
                  onClick={() => void handover(item.id)}
                >
                  {handoverBusy === item.id
                    ? "Memproses..."
                    : "Konfirmasi serah terima"}
                </button>
              )}{" "}
              {(item.status === "pending_payment" ||
                item.status === "confirmed") && (
                <CancelOrderButton
                  id={item.id}
                  status={item.status}
                  onChanged={() => void load()}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Sebelumnya
        </button>{" "}
        Halaman {page}{" "}
        <button
          type="button"
          disabled={items.length < 20}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </section>
  );
}
