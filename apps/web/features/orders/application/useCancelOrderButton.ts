import { useState } from "react";
import {
  cancelOrderRequest,
  getSessionRequest,
} from "../data/cancelOrderButtonApi";
export function useCancelOrderButton({
  id,
  status,
  onChanged,
}: {
  id: string;
  status: "pending_payment" | "confirmed";
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function cancel() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const session = await getSessionRequest({
        cache: "no-store",
      });
      if (!session.data) {
        setMessage("Silakan masuk kembali.");
        return;
      }
      const result = await cancelOrderRequest({
        params: { path: { id } },
        headers: { "X-CSRF-Token": session.data.csrfToken },
        body: { expectedStatus: status },
      });
      if (!result.data)
        setMessage(result.error?.message ?? "Pesanan tidak dapat dibatalkan.");
      onChanged();
    } catch {
      setMessage("Pesanan tidak dapat dibatalkan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, cancel };
}
