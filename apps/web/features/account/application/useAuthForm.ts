import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  getLoginCsrfRequest,
  loginRequest,
  registerRequest,
} from "../data/authFormApi";
export function useAuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let registered = false;
    try {
      const csrf = await getLoginCsrfRequest();
      if (!csrf.data) throw new Error("Layanan belum tersedia.");
      if (mode === "register") {
        const result = await registerRequest({
          headers: { "X-CSRF-Token": csrf.data.csrfToken },
          body: { name, email, phone, password, client: "marketplace" },
        });
        if (result.error || !result.data)
          throw new Error(result.error?.message ?? "Pendaftaran gagal.");
        registered = true;
      }
      const login = await loginRequest({
        headers: { "X-CSRF-Token": csrf.data.csrfToken },
        body: { email, password, client: "marketplace" },
      });
      if (login.error || !login.data)
        throw new Error(
          registered
            ? "Akun berhasil dibuat. Silakan masuk melalui halaman masuk."
            : (login.error?.message ?? "Tidak dapat masuk."),
        );
      router.push("/akun");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Layanan belum tersedia.",
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    name,
    setName,
    email,
    setEmail,
    phone,
    setPhone,
    password,
    setPassword,
    busy,
    error,
    submit,
  };
}
