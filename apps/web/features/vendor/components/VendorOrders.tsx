"use client";
import { CancelOrderButton } from "../../orders/components/CancelOrderButton";
import { OrderHistoryDetails } from "../../orders/components/OrderHistoryDetails";
import { orderStatuses, type OrderStatus } from "../../orders/presentation";
import { currency, labels } from "../VendorOrders.model";
import { useVendorOrders } from "../application/useVendorOrders";

export function VendorOrders() {
  const {
    items,
    page,
    setPage,
    status,
    setStatus,
    selected,
    setSelected,
    error,
    handoverBusy,
    returnBusy,
    loading,
    load,
    handover,
    confirmReturn,
  } = useVendorOrders();
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
