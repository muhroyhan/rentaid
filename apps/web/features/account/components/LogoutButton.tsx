"use client";
import { useLogoutButton } from "../application/useLogoutButton";

export function LogoutButton({ csrfToken }: { csrfToken: string }) {
  const { busy, error, logout } = useLogoutButton({ csrfToken });
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
