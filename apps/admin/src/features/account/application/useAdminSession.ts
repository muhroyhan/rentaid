import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminSession } from "../App.model";
import {
  getLoginCsrfRequest,
  getSessionRequest,
  loginRequest,
  logoutRequest,
} from "../data/accountApi";
export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const expireSession = useCallback(() => {
    setSession(null);
    setError("Sesi berakhir. Silakan masuk kembali.");
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { data } = await getSessionRequest();
        if (alive && data?.user.role === "admin") setSession(data);
      } catch {
        if (alive) setError("Layanan belum tersedia. Coba lagi sebentar.");
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const csrf = await getLoginCsrfRequest();
      if (!csrf.data) throw new Error("Layanan belum tersedia.");
      const result = await loginRequest({
        body: { email, password, client: "admin" },
        headers: { "X-CSRF-Token": csrf.data.csrfToken },
      });
      if (result.error || !result.data)
        throw new Error(result.error?.message ?? "Tidak dapat masuk.");
      setSession(result.data);
      setPassword("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tidak dapat masuk. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!session?.csrfToken) return;
    setBusy(true);
    setError("");
    try {
      const result = await logoutRequest({
        headers: { "X-CSRF-Token": session.csrfToken },
      });
      if (result.error && result.response.status !== 401)
        throw new Error(result.error.message);
      setSession(null);
    } catch {
      setError("Tidak dapat keluar. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  return {
    session,
    checking,
    busy,
    email,
    setEmail,
    password,
    setPassword,
    error,
    expireSession,
    login,
    logout,
  };
}
