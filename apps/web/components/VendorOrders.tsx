"use client";
import { useEffect, useState } from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../lib/api";
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
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await api.GET("/api/v1/vendor/orders", {
          params: { query: { page, page_size: 20 } },
          cache: "no-store",
        });
        if (active) {
          if (result.data) {
            setItems(result.data);
            setError("");
          } else
            setError(result.error?.message ?? "Pesanan tidak dapat dimuat.");
        }
      } catch {
        if (active) setError("Pesanan tidak dapat dimuat.");
      }
    })();
    return () => {
      active = false;
    };
  }, [page]);
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
