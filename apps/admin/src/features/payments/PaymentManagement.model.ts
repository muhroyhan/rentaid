import { type components } from "@rentaid/api-client";
export type Payment = components["schemas"]["Payment"];
export const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export const labels: Record<Payment["status"], string> = {
  succeeded: "Berhasil",
  failed: "Gagal",
  expired: "Kedaluwarsa",
};
