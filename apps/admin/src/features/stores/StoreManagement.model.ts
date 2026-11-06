import { type components } from "@rentaid/api-client";
export type Store = components["schemas"]["Store"];
export type Detail = components["schemas"]["StoreDetail"];
export type Action = components["schemas"]["StoreDecisionInput"]["action"];
export const labels: Record<Store["status"], string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  suspended: "Ditangguhkan",
};
