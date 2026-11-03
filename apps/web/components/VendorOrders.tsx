"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../lib/api";
import { CancelOrderButton } from "./CancelOrderButton";
import { OrderHistoryDetails } from "./OrderHistoryDetails";
import { orderStatuses, type OrderStatus } from "../lib/orders";
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
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [handoverBusy, setHandoverBusy] = useState("");
  const [returnBusy, setReturnBusy] = useState("");
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await api.GET("/api/v1/vendor/orders", {
        params: {
          query: { page, page_size: 20, ...(status ? { status } : {}) },
        },
        cache: "no-store",
      });
      if (version !== requestVersion.current) return;
      if (result.data) {
        setItems(result.data);
        setError("");
      } else {
        setItems([]);
        setError(result.error?.message ?? "Pesanan tidak dapat dimuat.");
      }
    } catch {
      if (version === requestVersion.current) {
        setItems([]);
        setError("Pesanan tidak dapat dimuat.");
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [page, status]);
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
  async function confirmReturn(id: string) {
    if (returnBusy) return;
    setReturnBusy(id);
    setError("");
    try {
      const session = await api.GET("/api/v1/auth/session", {
        cache: "no-store",
      });
      if (!session.data) {
        setError("Silakan masuk kembali.");
        return;
      }
      const result = await api.POST("/api/v1/vendor/orders/{id}/return", {
        params: { path: { id } },
        headers: { "X-CSRF-Token": session.data.csrfToken },
      });
      if (!result.data) {
        setError(result.error?.message ?? "Pengembalian tidak berhasil.");
        return;
      }
      await load();
    } catch {
      setError("Pengembalian tidak berhasil. Coba lagi.");
    } finally {
      setReturnBusy("");
    }
  }
  useEffect(() => {
    void load();
    return () => {
      requestVersion.current++;
    };
  }, [load]);
  return (
    <section className="surface vendor-orders" aria-label="Pesanan masuk">
      <span className="eyebrow">PESANAN MASUK</span>
      <h2>Pesanan toko</h2>
      <label htmlFor="vendor-order-filter">Status pesanan</label>{" "}
      <select
        id="vendor-order-filter"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value as OrderStatus | "");
          setPage(1);
          setSelected("");
        }}
      >
        <option value="">Semua status</option>
        {orderStatuses.map((s) => (
          <option key={s} value={s}>
            {labels[s]}
          </option>
        ))}
      </select>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>Memuat pesanan...</p>
      ) : error && items.length === 0 ? null : items.length === 0 ? (
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
              <button
                type="button"
                onClick={() => setSelected(selected === item.id ? "" : item.id)}
              >
                {selected === item.id ? "Tutup detail" : "Lihat detail"}
              </button>
              {selected === item.id && (
                <OrderHistoryDetails
                  key={`${item.id}:${item.status}`}
                  id={item.id}
                  scope="vendor"
                />
              )}
              {item.returnedAt && (
                <p>
                  Dikembalikan:{" "}
                  {new Intl.DateTimeFormat("id-ID", {
                    dateStyle: "long",
                    timeStyle: "short",
                    timeZone: "Asia/Jakarta",
                  }).format(new Date(item.returnedAt))}{" "}
                  WIB
                </p>
              )}
              {item.status === "renting" && (
                <div>
                  <p>
                    Pengembalian awal tidak membebaskan stok sebelum akhir
                    tanggal sewa.
                  </p>
                  <button
                    type="button"
                    disabled={returnBusy !== ""}
                    onClick={() => void confirmReturn(item.id)}
                  >
                    {returnBusy === item.id
                      ? "Memproses..."
                      : "Konfirmasi pengembalian"}
                  </button>
                </div>
              )}{" "}
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
          disabled={loading || page === 1}
          onClick={() => setPage(page - 1)}
        >
          Sebelumnya
        </button>{" "}
        Halaman {page}{" "}
        <button
          type="button"
          disabled={loading || items.length < 20}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </section>
  );
}
