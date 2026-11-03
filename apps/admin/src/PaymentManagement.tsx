import { createApiClient, type components } from "@rentaid/api-client";
import { useCallback, useEffect, useState } from "react";
const api = createApiClient(window.location.origin);
type Payment = components["schemas"]["Payment"];
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const labels: Record<Payment["status"], string> = {
  succeeded: "Berhasil",
  failed: "Gagal",
  expired: "Kedaluwarsa",
};
export function PaymentManagement({ onExpired }: { onExpired: () => void }) {
  const [items, setItems] = useState<Payment[]>([]);
  const [detail, setDetail] = useState<Payment | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await api.GET("/api/v1/admin/payments", {
        params: { query: { page, page_size: 20 } },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error();
      setItems(result.data);
      setError("");
    } catch {
      setError("Daftar transaksi tidak dapat dimuat.");
    }
  }, [onExpired, page]);
  useEffect(() => {
    void load();
  }, [load]);
  async function select(id: string) {
    try {
      const result = await api.GET("/api/v1/admin/payments/{id}", {
        params: { path: { id } },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error();
      setDetail(result.data);
      setError("");
    } catch {
      setError("Detail transaksi tidak dapat dimuat.");
    }
  }
  return (
    <section className="content-panel" aria-label="Transaksi">
      <h2>Transaksi pembayaran</h2>
      <p>Hasil pembayaran simulasi untuk seluruh toko.</p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <p>Belum ada transaksi pada halaman ini.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button className="outline" onClick={() => void select(item.id)}>
                {item.orderCode} · {labels[item.status]} ·{" "}
                {currency.format(item.amount)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          className="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Sebelumnya
        </button>{" "}
        Halaman {page}{" "}
        <button
          className="outline"
          disabled={items.length < 20}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
      {detail && (
        <div>
          <h3>Detail transaksi {detail.orderCode}</h3>
          <p>
            {detail.productName} · {detail.storeName}
          </p>
          <p>Status: {labels[detail.status]}</p>
          <p>Jumlah: {currency.format(detail.amount)}</p>
          <p>
            {new Intl.DateTimeFormat("id-ID", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "Asia/Jakarta",
            }).format(new Date(detail.createdAt))}{" "}
            WIB
          </p>
        </div>
      )}
    </section>
  );
}
