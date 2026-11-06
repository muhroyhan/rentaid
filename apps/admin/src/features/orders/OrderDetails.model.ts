import { type components } from "@rentaid/api-client";
export type Detail = components["schemas"]["OrderDetail"];
export const labels: Record<components["schemas"]["Order"]["status"], string> =
  {
    pending_payment: "Menunggu pembayaran",
    confirmed: "Terkonfirmasi",
    renting: "Sedang disewa",
    completed: "Selesai",
    cancelled: "Dibatalkan",
    expired: "Kedaluwarsa",
    payment_failed: "Pembayaran gagal",
  };
export const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export const date = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});
