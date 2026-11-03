"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { components } from "@rentaid/api-client";
import { api } from "../../../lib/api";
import { CancelOrderButton } from "../../../components/CancelOrderButton";
type Order = components["schemas"]["Order"];
type Outcome = components["schemas"]["PaymentInput"]["outcome"];
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const labels: Record<Order["status"], string> = {
  pending_payment: "Menunggu pembayaran",
  confirmed: "Pesanan terkonfirmasi",
  payment_failed: "Pembayaran gagal",
  expired: "Pesanan kedaluwarsa",
  renting: "Sedang disewa",
  completed: "Pesanan selesai",
  cancelled: "Pesanan dibatalkan",
};
export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
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
  async function refreshOrder() {
    try {
      const latest = await api.GET("/api/v1/orders/{id}", {
        params: { path: { id } },
        cache: "no-store",
      });
      if (latest.data) setOrder(latest.data);
      else setMessage("Pesanan tidak dapat dimuat ulang.");
    } catch {
      setMessage("Pesanan tidak dapat dimuat ulang.");
    }
  }
  async function simulate(outcome: Outcome) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      const session = await api.GET("/api/v1/auth/session", {
        cache: "no-store",
      });
      if (!session.data) {
        setMessage("Silakan masuk kembali.");
        return;
      }
      const storageKey = `rentaid-payment:${id}:${outcome}`;
      let key = sessionStorage.getItem(storageKey);
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(storageKey, key);
      }
      const result = await api.POST("/api/v1/payment-simulator", {
        params: {
          header: {
            "Idempotency-Key": key,
            "X-CSRF-Token": session.data.csrfToken,
          },
        },
        body: { orderId: id, outcome },
      });
      if (result.data) {
        sessionStorage.removeItem(storageKey);
        setNotice("Hasil simulasi tersimpan.");
      } else {
        if (result.response.status >= 400 && result.response.status < 500)
          sessionStorage.removeItem(storageKey);
        setMessage(result.error?.message ?? "Simulasi belum berhasil.");
      }
      const latest = await api.GET("/api/v1/orders/{id}", {
        params: { path: { id } },
        cache: "no-store",
      });
      if (latest.data) setOrder(latest.data);
    } catch {
      setMessage("Simulasi belum berhasil. Coba lagi dengan hasil yang sama.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="section-width page-shell">
      <Link href="/katalog" className="inline-link">
        ← Kembali ke katalog
      </Link>
      {message && (
        <div role="alert" className="catalog-state">
          {message}
          {!order && (
            <>
              {" "}
              <Link href="/masuk">Masuk</Link>
            </>
          )}
        </div>
      )}
      {!order ? (
        !message && <p>Memuat pesanan...</p>
      ) : (
        <section className="order-card">
          <span className="eyebrow">PESANAN {order.orderCode}</span>
          <h1>{labels[order.status]}</h1>
          {order.status === "pending_payment" && (
            <p>
              Stok ditahan sampai{" "}
              {new Intl.DateTimeFormat("id-ID", {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: "Asia/Jakarta",
              }).format(new Date(order.holdUntil))}{" "}
              WIB.
            </p>
          )}
          <h2>{order.productName}</h2>
          <p>
            {order.storeName} · {order.storeAddress}
          </p>
          <p>
            {order.startDate} — {order.endDate} · {order.quantity} barang
          </p>
          <strong>Total {currency.format(order.total)}</strong>
          {(order.refundAmount ?? 0) > 0 && (
            <p>
              Refund simulasi berhasil:{" "}
              {currency.format(order.refundAmount ?? 0)}
            </p>
          )}
          {(order.status === "pending_payment" ||
            order.status === "confirmed") && (
            <div className="payment-simulator">
              <p>
                {order.status === "confirmed"
                  ? "Pembatalan akan menghasilkan refund simulasi penuh."
                  : "Pembatalan akan melepas stok yang ditahan."}
              </p>
              <CancelOrderButton
                id={order.id}
                status={order.status}
                onChanged={() => void refreshOrder()}
              />
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          {order.status === "pending_payment" && (
            <div className="payment-simulator">
              <h2>Simulasi pembayaran</h2>
              <p>Ini hanya simulasi lokal. Tidak ada uang yang dipindahkan.</p>
              <div className="payment-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void simulate("succeeded")}
                >
                  Simulasikan berhasil
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void simulate("failed")}
                >
                  Simulasikan gagal
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void simulate("expired")}
                >
                  Simulasikan kedaluwarsa
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
