import Link from "next/link";
import { getSession } from "../lib/session";
export default async function Home() {
  const session = await getSession();
  return (
    <main>
      <section className="hero section-width">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" /> UNTUK SETIAP RENCANA ANDA
          </span>
          <h1>
            Ada banyak cara <em>untuk memulai.</em>
          </h1>
          <p>
            Hal-hal baik tidak selalu harus dimiliki. Temukan kemudahan menyewa
            dan bagikan yang Anda punya, di satu tempat.
          </p>
          <div className="hero-actions">
            <Link
              className="button button-dark"
              href={session ? "/akun" : "/daftar"}
            >
              {session ? "Lihat akun saya" : "Mulai bersama Rentaid"}{" "}
              <span>↗</span>
            </Link>
            <Link className="inline-link" href="/toko">
              Punya barang untuk disewakan? <span>↗</span>
            </Link>
          </div>
          <div className="hero-note">
            <span className="note-icon">✳</span>
            <span>
              Untuk perjalanan besar maupun
              <br />
              kebutuhan sehari-hari.
            </span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="visual-card">
            <span className="card-overline">LEBIH BANYAK KEMUNGKINAN</span>
            <div className="visual-object">
              <span>✳</span>
            </div>
            <div className="card-bottom">
              <strong>
                Sewa yang
                <br />
                terasa mudah.
              </strong>
              <span>01 / 03</span>
            </div>
          </div>
          <div className="float-tag">
            <span>✦</span>
            <div>
              <strong>Punya rencana?</strong>
              <small>Ada cara yang lebih ringan.</small>
            </div>
          </div>
          <span className="visual-number">01 — 03</span>
        </div>
      </section>
      <section className="intro-strip">
        <div className="section-width strip-inner">
          <span className="eyebrow">HAL BAIK DIMULAI DARI SINI</span>
          <p>
            Satu tempat untuk kebutuhan Anda,{" "}
            <em>dan kesempatan baru untuk barang Anda.</em>
          </p>
          <Link href="/toko">
            Kenali Rentaid <span>↗</span>
          </Link>
        </div>
      </section>
      <section className="section-width steps">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SEDERHANA DARI AWAL</span>
            <h2>
              Lebih dekat dengan
              <br />
              <em>yang Anda butuhkan.</em>
            </h2>
          </div>
          <p>Mulai dengan akun, lalu jelajahi kemungkinan bersama Rentaid.</p>
        </div>
        <div className="step-grid">
          <article>
            <span>01 / AKUN</span>
            <h3>Mulai dari sini.</h3>
            <p>
              Buat akun dan lengkapi profil agar semua siap saat dibutuhkan.
            </p>
          </article>
          <article>
            <span>02 / TOKO</span>
            <h3>Bagikan yang Anda punya.</h3>
            <p>Ajukan toko Anda dan tunggu persetujuan dari tim kami.</p>
          </article>
          <article>
            <span>03 / RENCANA</span>
            <h3>Siap untuk lebih.</h3>
            <p>Kelola kebutuhan sewa Anda di satu tempat yang sederhana.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
