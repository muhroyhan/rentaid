import { cookies } from "next/headers";
const base = process.env.API_ORIGIN ?? "http://127.0.0.1:8080";
export async function authenticatedFetch(path: string) {
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
