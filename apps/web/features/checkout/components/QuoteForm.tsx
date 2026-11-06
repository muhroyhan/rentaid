"use client";
import Link from "next/link";
import { currency } from "../QuoteForm.model";
import { useQuoteForm } from "../application/useQuoteForm";

export function QuoteForm({
  productId,
  stock,
}: {
  productId: string;
  stock: number;
}) {
  const {
    needLogin,
    needPhone,
    start,
    setStart,
    end,
    setEnd,
    quantity,
    setQuantity,
    quote,
    error,
    busy,
    submit,
    checkout,
    clear,
  } = useQuoteForm({ productId });
  return (
    <section className="quote-box" aria-labelledby="quote-heading">
      <span className="eyebrow">RENCANAKAN SEWA</span>
      <h2 id="quote-heading">Hitung biaya sewa</h2>
      <p>Pilih tanggal dan jumlah barang untuk melihat perkiraan biaya.</p>
      <form onSubmit={submit} className="quote-form">
        <label>
          Tanggal mulai
          <input
            type="date"
            required
            disabled={busy}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              clear();
            }}
          />
        </label>
        <label>
          Tanggal selesai
          <input
            type="date"
            required
            disabled={busy}
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              clear();
            }}
          />
        </label>
        <label>
          Jumlah barang
          <input
            type="number"
            required
            disabled={busy}
            min="1"
            max={stock || 1}
            step="1"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              clear();
            }}
          />
        </label>
        <button type="submit" disabled={busy || stock === 0}>
          {busy ? "Menghitung..." : "Lihat penawaran"}
        </button>
      </form>
      {error && (
        <p role="alert" className="quote-error">
          {error} {needLogin && <Link href="/masuk">Masuk</Link>}{" "}
          {needPhone && <Link href="/akun">Lengkapi profil</Link>}
        </p>
      )}
      {quote && (
        <div className="quote-result" aria-live="polite">
          <h3>Ringkasan penawaran</h3>
          <p>
            {currency.format(quote.dailyPrice)} × {quote.days} hari ×{" "}
            {quote.quantity} barang
          </p>
          <p>Tersedia untuk tanggal ini: {quote.available}</p>
          <strong>Total {currency.format(quote.total)}</strong>
          <p>Penawaran ini belum menahan stok.</p>
          <button
            className="checkout-button"
            type="button"
            disabled={busy || quote.available < quote.quantity}
            onClick={() => void checkout()}
          >
            {busy ? "Memproses..." : "Lanjut ke checkout"}
          </button>
        </div>
      )}
    </section>
  );
}
