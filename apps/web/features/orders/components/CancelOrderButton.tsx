"use client";
import { useCancelOrderButton } from "../application/useCancelOrderButton";

export function CancelOrderButton({
  id,
  status,
  onChanged,
}: {
  id: string;
  status: "pending_payment" | "confirmed";
  onChanged: () => void;
}) {
  const { busy, message, cancel } = useCancelOrderButton({
    id,
    status,
    onChanged,
  });
  return (
    <div>
      <button type="button" disabled={busy} onClick={() => void cancel()}>
        {busy ? "Memproses..." : "Batalkan pesanan"}
      </button>
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
