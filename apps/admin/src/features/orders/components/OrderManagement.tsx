import { Order, currency, labels } from "../OrderManagement.model";
import { useOrderManagement } from "../application/useOrderManagement";
import { OrderDetails } from "./OrderDetails";

export function OrderManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const {
    items,
    page,
    setPage,
    status,
    setStatus,
    selected,
    setSelected,
    error,
    busy,
    loading,
    cancel,
  } = useOrderManagement({ csrfToken, onExpired });
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
