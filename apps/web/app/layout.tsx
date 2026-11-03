import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "../lib/session";
import { LogoutButton } from "../components/LogoutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rentaid - Sewa jadi lebih mudah",
  description: "Temukan kebutuhan sewa dan kelola toko Anda di Rentaid.",
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let session: Awaited<ReturnType<typeof getSession>> = null;
  let sessionUnavailable = false;
  try {
    session = await getSession();
  } catch {
    sessionUnavailable = true;
  }
  return (
    <html lang="id">
      <body>
        <header className="site-header">
          <div className="header-inner">
            <Link href="/" className="wordmark">
              <span className="brand-mark">r</span>rentaid
              <span className="brand-dot">.</span>
            </Link>
            <nav aria-label="Navigasi utama">
              <Link href="/">Beranda</Link>
              <Link href="/katalog">Katalog</Link>
              <Link href="/toko">Buka toko</Link>
              {session && <Link href="/akun">Akun saya</Link>}
            </nav>
            <div className="header-actions">
              {sessionUnavailable ? (
                <span className="small-error" role="status">
                  Layanan akun belum tersedia.
                </span>
              ) : session ? (
                <LogoutButton csrfToken={session.csrfToken ?? ""} />
              ) : (
                <>
                  <Link className="login-link" href="/masuk">
                    Masuk
                  </Link>
                  <Link
                    className="button button-dark button-small"
                    href="/daftar"
                  >
                    Daftar <span>↗</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="footer-inner">
            <Link href="/" className="wordmark footer-brand">
              <span className="brand-mark">r</span>rentaid
              <span className="brand-dot">.</span>
            </Link>
            <p>Lebih mudah saat dibutuhkan, lebih ringan untuk dijalani.</p>
            <span>© Rentaid · Dibuat untuk berbagi lebih banyak</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
