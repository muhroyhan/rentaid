import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm } from "../../features/account/components/ProfileForm";
import { getSession } from "../../features/account/data/session";
export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/masuk");
  return (
    <main className="section-width page-shell">
      <div className="page-heading">
        <span className="eyebrow">RUANG PRIBADI ANDA</span>
        <h1>
          Halo, <em>senang bertemu.</em>
        </h1>
        <p>Kelola detail akun dan perjalanan Anda bersama Rentaid.</p>
      </div>
      <div className="dashboard-grid">
        <section className="surface">
          <div className="surface-title">
            <div>
              <span className="eyebrow">01 / PROFIL</span>
              <h2>Detail akun</h2>
            </div>
            <span>✳</span>
          </div>
          <ProfileForm csrfToken={session.csrfToken ?? ""} />
        </section>
        <aside className="side-card">
          <span className="eyebrow">PUNYA BARANG UNTUK DISEWAKAN?</span>
          <h2>
            Mulai langkah
            <br />
            <em>baru Anda.</em>
          </h2>
          <p>
            Ajukan toko dan jadikan barang Anda bermanfaat untuk lebih banyak
            orang.
          </p>
          <Link className="button button-light" href="/toko">
            Kelola toko <span>↗</span>
          </Link>
        </aside>
      </div>
    </main>
  );
}
