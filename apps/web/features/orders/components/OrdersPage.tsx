"use client";
import Link from "next/link";
import { useOrdersPage } from "../application/useOrdersPage";
import {
  orderCurrency,
  orderLabels,
  orderStatuses,
  type OrderStatus,
} from "../presentation";

export function OrdersPage() {
  const { items, status, setStatus, page, setPage, error, loading } =
    useOrdersPage();
  return (
    <main className="section-width page-shell">
      <div className="page-heading">
        <span className="eyebrow">PERJALANAN SEWA</span>
        <h1>
          Pesanan saya<span className="accent-dot">.</span>
        </h1>
        <p>Lihat status dan riwayat sewa Anda.</p>
      </div>
      <section className="surface vendor-orders">
        <label htmlFor="renter-order-filter">Status pesanan</label>{" "}
        <select
          id="renter-order-filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrderStatus | "");
            setPage(1);
          }}
        >
          <option value="">Semua status</option>
          {orderStatuses.map((s) => (
            <option key={s} value={s}>
              {orderLabels[s]}
            </option>
          ))}
        </select>
        {error && (
          <p role="alert">
            {error} <Link href="/masuk">Masuk</Link>
          </p>
        )}
        {loading ? (
          <p>Memuat pesanan...</p>
        ) : error ? null : items.length === 0 ? (
          <p>Belum ada pesanan pada halaman ini.</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <Link href={`/pesanan/${item.id}`}>
                  <strong>
                    {item.orderCode} · {item.productName}
                  </strong>
                </Link>
                <p>
                  {item.startDate} — {item.endDate} ·{" "}
                  {orderCurrency.format(item.total)}
                </p>
                <p>Status: {orderLabels[item.status]}</p>
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
    </main>
  );
}
