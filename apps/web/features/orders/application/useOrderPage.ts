import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getOrderRequest,
  getSessionRequest,
  simulatePaymentRequest,
} from "../data/orderPageApi";
import { Order, Outcome } from "../OrderPage.model";
export function useOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await getOrderRequest({
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
      const latest = await getOrderRequest({
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
      const session = await getSessionRequest({
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
      const result = await simulatePaymentRequest({
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
      const latest = await getOrderRequest({
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
  return { order, message, busy, notice, refreshOrder, simulate };
}
