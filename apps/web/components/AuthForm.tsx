"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
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
      const csrf = await api.GET("/api/v1/auth/csrf");
      if (!csrf.data) throw new Error("Layanan belum tersedia.");
      if (mode === "register") {
        const result = await api.POST("/api/v1/auth/register", {
          headers: { "X-CSRF-Token": csrf.data.csrfToken },
          body: { name, email, phone, password, client: "marketplace" },
        });
        if (result.error || !result.data)
          throw new Error(result.error?.message ?? "Pendaftaran gagal.");
        registered = true;
      }
      const login = await api.POST("/api/v1/auth/login", {
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
  return (
    <form className="stack-form" onSubmit={(event) => void submit(event)}>
      {mode === "register" && (
        <>
          <label htmlFor="name">Nama lengkap</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            maxLength={120}
          />
        </>
      )}
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
        maxLength={254}
      />
      {mode === "register" && (
        <>
          <label htmlFor="phone">
            Nomor telepon <span className="optional">(opsional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            maxLength={40}
          />
        </>
      )}
      <label htmlFor="password">Kata sandi</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        minLength={mode === "register" ? 12 : 1}
        maxLength={1024}
        required
      />
      {mode === "register" && (
        <p className="field-hint">Gunakan minimal 12 karakter.</p>
      )}
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      <button
        className="button button-dark form-submit"
        type="submit"
        disabled={busy}
      >
        {busy
          ? "Tunggu sebentar..."
          : mode === "login"
            ? "Masuk ke Rentaid"
            : "Buat akun"}
        <span>↗</span>
      </button>
      <p className="auth-switch">
        {mode === "login" ? "Belum punya akun? " : "Sudah punya akun? "}
        <Link href={mode === "login" ? "/daftar" : "/masuk"}>
          {mode === "login" ? "Daftar sekarang" : "Masuk"}
        </Link>
      </p>
    </form>
  );
}
