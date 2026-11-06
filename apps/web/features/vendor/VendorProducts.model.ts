import type { components } from "@rentaid/api-client";
export type Product = components["schemas"]["Product"];
export type Category = components["schemas"]["Category"];
export type Editor =
  { kind: "new" } | { kind: "edit"; product: Product } | null;
export const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
