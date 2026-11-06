import type { components } from "@rentaid/api-client";
export type Store = components["schemas"]["Store"];
export type History = components["schemas"]["StoreDetail"]["history"];
export const labels: Record<Store["status"], string> = {
  pending: "Menunggu persetujuan",
  approved: "Disetujui",
  rejected: "Perlu diperbaiki",
  suspended: "Ditangguhkan",
};
