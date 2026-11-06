"use client";
import Link from "next/link";
import { currency, labels } from "../OrderPage.model";
import { useOrderPage } from "../application/useOrderPage";
import { CancelOrderButton } from "./CancelOrderButton";
import { OrderHistoryDetails } from "./OrderHistoryDetails";

export function OrderPage() {
  const { order, message, busy, notice, refreshOrder, simulate } =
    useOrderPage();
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
          {order.returnedAt && (
            <p>
              Dikembalikan:{" "}
              {new Intl.DateTimeFormat("id-ID", {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: "Asia/Jakarta",
              }).format(new Date(order.returnedAt))}{" "}
              WIB
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
          <OrderHistoryDetails
            key={`${order.id}:${order.status}`}
            id={order.id}
            scope="renter"
          />
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
