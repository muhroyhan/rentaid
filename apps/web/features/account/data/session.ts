import type { components } from "@rentaid/api-client";
import { authenticatedFetch } from "../../../lib/authenticatedFetch";
type Session = components["schemas"]["Session"];
export async function getSession(): Promise<Session | null> {
  const response = await authenticatedFetch("/api/v1/auth/session");
  if (!response || response.status === 401) return null;
  if (!response.ok) throw new Error("Sesi tidak dapat diperiksa.");
  const session = (await response.json()) as Session;
  return session.user.role === "user" ? session : null;
}
