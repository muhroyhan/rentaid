"use client";
import { useState } from "react";
import { api } from "../lib/api";
export function CancelOrderButton({
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
      const session = await api.GET("/api/v1/auth/session", {
        cache: "no-store",
      });
      if (!session.data) {
        setMessage("Silakan masuk kembali.");
        return;
      }
      const result = await api.POST("/api/v1/orders/{id}/cancel", {
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
  return (
    <div>
      <button type="button" disabled={busy} onClick={() => void cancel()}>
        {busy ? "Memproses..." : "Batalkan pesanan"}
      </button>
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
