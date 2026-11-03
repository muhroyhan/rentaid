"use client";
import { useState, type FormEvent } from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../lib/api";

type Quote = components["schemas"]["Quote"];
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export function QuoteForm({
  productId,
  stock,
}: {
  productId: string;
  stock: number;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setQuote(null);
    setBusy(true);
    try {
      const result = await api.GET("/api/v1/products/{id}/quote", {
        params: {
          path: { id: productId },
          query: {
            start_date: start,
            end_date: end,
            quantity: Number(quantity),
          },
        },
        cache: "no-store",
      });
      if (result.data) setQuote(result.data);
      else
        setError(
          result.error?.message ?? "Penawaran belum tersedia. Coba lagi.",
        );
    } catch {
      setError("Penawaran belum tersedia. Periksa koneksi dan coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  function clear() {
    setQuote(null);
    setError("");
  }
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
          {error}
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
        </div>
      )}
    </section>
  );
}
