import type { components } from "@rentaid/api-client";
import { authenticatedFetch } from "../../../lib/authenticatedFetch";
export type Store = components["schemas"]["Store"];
export async function getDashboard(): Promise<{
  store: Store | null;
  unavailable: boolean;
}> {
  const response = await authenticatedFetch("/api/v1/vendor/dashboard");
  if (!response || response.status === 401 || response.status === 403)
    return { store: null, unavailable: false };
  if (!response.ok) return { store: null, unavailable: true };
  return { store: (await response.json()) as Store, unavailable: false };
}
export async function getOwnStore(): Promise<Store | null> {
  const response = await authenticatedFetch("/api/v1/store");
  if (!response || response.status === 401 || response.status === 404)
    return null;
  if (!response.ok) throw new Error("Informasi toko belum tersedia.");
  return (await response.json()) as Store;
}
