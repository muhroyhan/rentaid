import { createApiClient } from "@rentaid/api-client";
import { useEffect, useState, type FormEvent } from "react";

const api = createApiClient(window.location.origin);

type AdminSession = {
  user: { id: string; email: string; role: "admin" | "user" };
  csrfToken?: string;
  expiresAt: string;
};

function Mark() {
  return (
    <span className="brand">
      <span className="brand-icon" aria-hidden="true">
        r
      </span>
      rentaid<span className="brand-dot">.</span>
    </span>
  );
}

export function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { data } = await api.GET("/api/v1/auth/session");
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
      const csrf = await api.GET("/api/v1/auth/csrf");
      if (!csrf.data) throw new Error("Layanan belum tersedia.");
      const result = await api.POST("/api/v1/auth/login", {
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
      const result = await api.POST("/api/v1/auth/logout", {
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

  if (checking)
    return (
      <main className="loading" aria-live="polite">
        Menyiapkan Rentaid...
      </main>
    );
  if (session)
    return (
      <div className="dashboard">
        <header className="topbar">
          <Mark />
          <span className="top-label">ADMIN WORKSPACE</span>
          <button
            className="outline"
            onClick={() => void logout()}
            disabled={busy}
          >
            Keluar <span aria-hidden="true">↗</span>
          </button>
        </header>
        <main className="workspace">
          <div className="crumb">
            WORKSPACE <span>/</span> BERANDA
          </div>
          <div className="welcome">
            <div>
              <span className="eyebrow">RUANG KERJA ANDA</span>
              <h1>
                Selamat datang<span>.</span>
              </h1>
              <p>
                Semua yang Anda butuhkan untuk mengelola Rentaid, dalam satu
                tempat.
              </p>
            </div>
            <div className="status">
              <span /> Sesi aktif
            </div>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <section className="account-card">
            <div className="account-icon" aria-hidden="true">
              ✳
            </div>
            <div>
              <div className="card-label">MASUK SEBAGAI ADMIN</div>
              <strong>{session.user.email}</strong>
              <p>Akun Anda terhubung dan siap digunakan.</p>
            </div>
            <span className="account-arrow" aria-hidden="true">
              ↗
            </span>
          </section>
          <div className="next">
            <span className="next-number">01</span>
            <div>
              <strong>Ruang kerja siap.</strong>
              <p>Menu pengelolaan akan tersedia seiring pengembangan.</p>
            </div>
          </div>
        </main>
        <footer className="workspace-footer">
          <span>© Rentaid</span>
          <span>DIRANCANG UNTUK KEMUDAHAN</span>
        </footer>
      </div>
    );

  return (
    <main className="login-layout">
      <section className="story" aria-label="Rentaid">
        <div className="story-top">
          <Mark />
          <span className="badge">
            ADMIN WORKSPACE <span>↗</span>
          </span>
        </div>
        <div className="story-main">
          <div className="story-overline">
            <span /> LEBIH DEKAT, LEBIH MUDAH
          </div>
          <h1>
            Ruang untuk
            <br />
            semua yang
            <br />
            <em>bergerak.</em>
          </h1>
          <p>
            Tempat yang lebih sederhana untuk mengelola setiap bagian dari
            perjalanan sewa.
          </p>
        </div>
        <div className="story-art" aria-hidden="true">
          <div className="art-arc arc-one" />
          <div className="art-arc arc-two" />
          <div className="art-sun" />
          <span>
            SEWA
            <br />
            JADI
            <br />
            MUDAH.
          </span>
        </div>
        <div className="story-bottom">
          <span>© RENTAID 2026</span>
          <span>MADE FOR BETTER RENTALS &nbsp; ↗</span>
        </div>
      </section>
      <section className="form-side">
        <div className="mobile-brand">
          <Mark />
        </div>
        <div className="form-top">
          RUANG ADMINISTRATOR <span>01 / 01</span>
        </div>
        <div className="form-content">
          <div className="form-icon" aria-hidden="true">
            ↗
          </div>
          <div className="eyebrow">SELAMAT DATANG KEMBALI</div>
          <h2>
            Masuk ke
            <br />
            ruang kerja<span>.</span>
          </h2>
          <p className="intro">
            Masukkan akun administrator untuk melanjutkan.
          </p>
          <form onSubmit={(event) => void login(event)}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="nama@contoh.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
            />
            <label htmlFor="password">Kata sandi</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={1024}
            />
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Sedang masuk..." : "Masuk ke Rentaid"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <div className="form-note">
            <span aria-hidden="true">✳</span>
            <p>Halaman ini hanya untuk tim administrator Rentaid.</p>
          </div>
        </div>
        <div className="form-footer">
          <span>RENTAID ADMIN</span>
          <span>AKSES TERBATAS</span>
        </div>
      </section>
    </main>
  );
}
