import { cookies } from "next/headers";
import type { components } from "@rentaid/api-client";

type Session = components["schemas"]["Session"];
export type Store = components["schemas"]["Store"];
const base = process.env.API_ORIGIN ?? "http://127.0.0.1:8080";

async function authenticatedFetch(path: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("rentaid_session");
  if (!token) return null;
  try {
    return await fetch(`${base}${path}`, {
      headers: { cookie: `rentaid_session=${encodeURIComponent(token.value)}` },
      cache: "no-store",
    });
  } catch {
    throw new Error("Layanan Rentaid belum tersedia. Coba lagi sebentar.");
  }
}
export async function getSession(): Promise<Session | null> {
  const response = await authenticatedFetch("/api/v1/auth/session");
  if (!response || response.status === 401) return null;
  if (!response.ok) throw new Error("Sesi tidak dapat diperiksa.");
  const session = (await response.json()) as Session;
  return session.user.role === "user" ? session : null;
}
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
