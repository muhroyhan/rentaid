import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  checkoutRequest,
  getProductQuoteRequest,
  getSessionRequest,
} from "../data/quoteFormApi";
import { Quote } from "../QuoteForm.model";
export function useQuoteForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [needLogin, setNeedLogin] = useState(false);
  const [needPhone, setNeedPhone] = useState(false);
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
      const result = await getProductQuoteRequest({
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
  async function checkout() {
    if (!quote || busy) return;
    setError("");
    setNeedLogin(false);
    setNeedPhone(false);
    setBusy(true);
    try {
      const session = await getSessionRequest({
        cache: "no-store",
      });
      if (session.response.status === 401) {
        setNeedLogin(true);
        setError("Silakan masuk sebelum checkout.");
        return;
      }
      if (!session.data) throw new Error("Sesi tidak dapat diperiksa.");
      const body = {
        productId,
        startDate: quote.startDate,
        endDate: quote.endDate,
        quantity: quote.quantity,
        expectedTotal: quote.total,
        expectedAvailable: quote.available,
      };
      const storageKey = `rentaid-checkout:${JSON.stringify(body)}`;
      let key = sessionStorage.getItem(storageKey);
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(storageKey, key);
      }
      const result = await checkoutRequest({
        params: {
          header: {
            "X-CSRF-Token": session.data.csrfToken,
            "Idempotency-Key": key,
          },
        },
        body,
      });
      if (result.data) {
        sessionStorage.removeItem(storageKey);
        router.push(`/pesanan/${result.data.id}`);
        return;
      }
      if (result.error && "quote" in result.error) {
        setQuote(result.error.quote);
        sessionStorage.removeItem(storageKey);
      }
      if (result.response.status >= 400 && result.response.status < 500)
        sessionStorage.removeItem(storageKey);
      if (result.error?.code === "phone_required") setNeedPhone(true);
      if (result.response.status === 401) setNeedLogin(true);
      setError(result.error?.message ?? "Checkout belum berhasil. Coba lagi.");
    } catch {
      setError("Checkout belum berhasil. Coba lagi dengan data yang sama.");
    } finally {
      setBusy(false);
    }
  }
  function clear() {
    setQuote(null);
    setError("");
  }
  return {
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
  };
}
