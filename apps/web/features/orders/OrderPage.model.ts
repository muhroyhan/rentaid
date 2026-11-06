import type { components } from "@rentaid/api-client";
export type Order = components["schemas"]["Order"];
export type Outcome = components["schemas"]["PaymentInput"]["outcome"];
export const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export const labels: Record<Order["status"], string> = {
  pending_payment: "Menunggu pembayaran",
  confirmed: "Pesanan terkonfirmasi",
  payment_failed: "Pembayaran gagal",
  expired: "Pesanan kedaluwarsa",
  renting: "Sedang disewa",
  completed: "Pesanan selesai",
  cancelled: "Pesanan dibatalkan",
};
