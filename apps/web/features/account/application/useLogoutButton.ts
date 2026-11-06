import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoutRequest } from "../data/logoutButtonApi";
export function useLogoutButton({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const result = await logoutRequest({
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (result.error && result.response.status !== 401) throw new Error();
      router.push("/");
      router.refresh();
    } catch {
      setError("Gagal keluar. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, logout };
}
