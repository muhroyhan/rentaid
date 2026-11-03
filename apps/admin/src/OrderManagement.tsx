import { createApiClient, type components } from "@rentaid/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { OrderDetails } from "./OrderDetails";
const api = createApiClient(window.location.origin);
type Order = components["schemas"]["VendorOrder"];
const labels: Record<Order["status"], string> = {
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
export function OrderManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const [items, setItems] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Order["status"] | "">("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await api.GET("/api/v1/admin/orders", {
        params: {
          query: { page, page_size: 20, ...(status ? { status } : {}) },
        },
      });
      if (version !== requestVersion.current) return;
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error();
      setItems(result.data);
    } catch {
      if (version === requestVersion.current) {
        setItems([]);
        setError("Daftar pesanan tidak dapat dimuat.");
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [page, status, onExpired]);
  useEffect(() => {
    void load();
    return () => {
      requestVersion.current++;
    };
  }, [load]);
  async function cancel(item: Order) {
    if (item.status !== "confirmed" && item.status !== "pending_payment")
      return;
    setBusy(true);
    setError("");
    try {
      const result = await api.POST("/api/v1/orders/{id}/cancel", {
        params: { path: { id: item.id } },
        headers: { "X-CSRF-Token": csrfToken },
        body: { expectedStatus: item.status },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data)
        setError(result.error?.message ?? "Pesanan tidak dapat dibatalkan.");
      await load();
    } catch {
      setError("Pesanan tidak dapat dibatalkan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-panel" aria-label="Pesanan">
      <h2>Pesanan</h2>
      <p>
        Kelola pesanan sebelum serah terima. Pembatalan pesanan terkonfirmasi
        menghasilkan refund simulasi penuh.
      </p>
      <label htmlFor="admin-order-filter">Status pesanan</label>{" "}
      <select
        id="admin-order-filter"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value as Order["status"] | "");
          setPage(1);
          setSelected("");
        }}
      >
        <option value="">Semua status</option>
        {(Object.keys(labels) as Order["status"][]).map((s) => (
          <option key={s} value={s}>
            {labels[s]}
          </option>
        ))}
      </select>{" "}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p>Memuat pesanan...</p>
      ) : error && items.length === 0 ? null : items.length === 0 ? (
        <p>Belum ada pesanan pada halaman ini.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>
                {item.orderCode} · {item.productName} · {item.storeName}
              </strong>
              <p>
                {item.renterName} · {item.renterPhone} · {item.startDate} —{" "}
                {item.endDate}
              </p>
              <p>
                Status: {labels[item.status]} · Total{" "}
                {currency.format(item.total)}
              </p>
              <button
                className="outline"
                onClick={() => setSelected(selected === item.id ? "" : item.id)}
              >
                {selected === item.id ? "Tutup detail" : "Lihat detail"}
              </button>
              {selected === item.id && (
                <OrderDetails
                  key={`${item.id}:${item.status}`}
                  id={item.id}
                  onExpired={onExpired}
                />
              )}{" "}
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
              )}{" "}
              {item.refundAmount > 0 && (
                <p>
                  Refund simulasi berhasil: {currency.format(item.refundAmount)}
                </p>
              )}
              {(item.status === "pending_payment" ||
                item.status === "confirmed") && (
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => void cancel(item)}
                >
                  Batalkan pesanan
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          className="outline"
          disabled={loading || page === 1}
          onClick={() => setPage(page - 1)}
        >
          Sebelumnya
        </button>{" "}
        Halaman {page}{" "}
        <button
          className="outline"
          disabled={loading || items.length < 20}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </section>
  );
}
