import type { components } from "@rentaid/api-client";
export type Quote = components["schemas"]["Quote"];
export const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
