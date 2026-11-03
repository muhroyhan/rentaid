"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../../lib/api";
import {
  orderCurrency,
  orderLabels,
  orderStatuses,
  type OrderStatus,
} from "../../lib/orders";
type Order = components["schemas"]["Order"];
export default function OrdersPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await api.GET("/api/v1/orders", {
        params: {
          query: { page, page_size: 20, ...(status ? { status } : {}) },
        },
        cache: "no-store",
      });
      if (version !== requestVersion.current) return;
      if (result.data) {
        setItems(result.data);
        setError("");
      } else
        setError(
          result.response.status === 401
            ? "Silakan masuk untuk melihat pesanan."
            : (result.error?.message ?? "Pesanan tidak dapat dimuat."),
        );
    } catch {
      if (version === requestVersion.current)
        setError("Pesanan tidak dapat dimuat.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [page, status]);
  useEffect(() => {
    void load();
    return () => {
      requestVersion.current++;
    };
  }, [load]);
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
