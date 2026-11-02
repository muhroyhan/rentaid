import { redirect } from "next/navigation";
import { getSession } from "../../lib/session";
import { StoreForm } from "../../components/StoreForm";
export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/masuk");
  return (
    <main className="section-width page-shell">
      <div className="page-heading">
        <span className="eyebrow">UNTUK MITRA RENTAID</span>
        <h1>
          Selamat datang di
          <br />
          <em>ruang usaha Anda.</em>
        </h1>
        <p>Mulai dari pengajuan toko, lalu tumbuh bersama komunitas Rentaid.</p>
      </div>
      <div className="dashboard-grid">
        <section className="surface">
          <div className="surface-title">
            <div>
              <span className="eyebrow">TOKO ANDA</span>
              <h2>Pengajuan toko</h2>
            </div>
            <span>✳</span>
          </div>
          <StoreForm csrfToken={session.csrfToken ?? ""} />
        </section>
        <aside className="side-card pale">
          <span className="eyebrow">LANGKAH SELANJUTNYA</span>
          <h2>
            Setiap toko
            <br />
            <em>punya cerita.</em>
          </h2>
          <p>
            Isi informasi toko Anda. Setelah disetujui admin, dashboard vendor
            akan terbuka untuk Anda.
          </p>
          <div className="side-steps">
            <span>01 &nbsp; Kirim pengajuan</span>
            <span>02 &nbsp; Tunggu peninjauan</span>
            <span>03 &nbsp; Mulai kelola toko</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
