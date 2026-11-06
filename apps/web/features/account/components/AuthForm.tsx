"use client";
import Link from "next/link";
import { useAuthForm } from "../application/useAuthForm";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const {
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
  } = useAuthForm({ mode });
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
