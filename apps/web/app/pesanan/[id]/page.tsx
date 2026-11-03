"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { components } from "@rentaid/api-client";
import { api } from "../../../lib/api";

type Order = components["schemas"]["Order"];
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await api.GET("/api/v1/orders/{id}", {
          params: { path: { id } },
          cache: "no-store",
        });
        if (!active) return;
        if (result.data) setOrder(result.data);
        else
          setMessage(
            result.response.status === 401
              ? "Silakan masuk untuk melihat pesanan."
              : (result.error?.message ?? "Pesanan tidak dapat dimuat."),
          );
      } catch {
        if (active) setMessage("Pesanan tidak dapat dimuat. Coba lagi.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <main className="section-width page-shell">
      <Link href="/katalog" className="inline-link">
        ← Kembali ke katalog
      </Link>
      {message ? (
        <div role="alert" className="catalog-state">
          {message} <Link href="/masuk">Masuk</Link>
        </div>
      ) : !order ? (
        <p>Memuat pesanan...</p>
      ) : (
        <section className="order-card">
          <span className="eyebrow">PESANAN {order.orderCode}</span>
          <h1>Menunggu pembayaran</h1>
          <p>
            Stok ditahan sampai{" "}
            {new Intl.DateTimeFormat("id-ID", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "Asia/Jakarta",
            }).format(new Date(order.holdUntil))}{" "}
            WIB.
          </p>
          <h2>{order.productName}</h2>
          <p>
            {order.storeName} · {order.storeAddress}
          </p>
          <p>
            {order.startDate} — {order.endDate} · {order.quantity} barang
          </p>
          <strong>Total {currency.format(order.total)}</strong>
          <p>
            Pembayaran simulasi tersedia pada tahap pengembangan berikutnya.
          </p>
        </section>
      )}
    </main>
  );
}
