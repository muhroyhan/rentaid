"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
export function LogoutButton({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const result = await api.POST("/api/v1/auth/logout", {
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
  return (
    <div className="logout-wrap">
      <button
        className="text-button"
        onClick={() => void logout()}
        disabled={busy}
      >
        Keluar
      </button>
      {error && (
        <span className="small-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
