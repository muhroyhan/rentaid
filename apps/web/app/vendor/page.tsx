import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboard, getSession } from "../../lib/session";
export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/masuk");
  const { store, unavailable } = await getDashboard();
  if (unavailable) throw new Error("Dashboard vendor belum tersedia.");
  if (!store)
    return (
      <main className="section-width page-shell">
        <div className="surface access-card">
          <span className="eyebrow">AKSES VENDOR</span>
          <h1>
            Belum bisa
            <br />
            <em>masuk ke sini.</em>
          </h1>
          <p>
            Dashboard tersedia setelah toko Anda disetujui. Lihat status
            pengajuan toko untuk informasi selengkapnya.
          </p>
          <Link className="button button-dark" href="/toko">
            Lihat status toko <span>↗</span>
          </Link>
        </div>
      </main>
    );
  return (
    <main className="section-width page-shell">
      <div className="page-heading">
        <span className="eyebrow">DASHBOARD VENDOR</span>
        <h1>
          Ruang untuk
          <br />
          <em>{store.name}.</em>
        </h1>
        <p>Selamat datang di ruang usaha Anda. Toko Anda sudah disetujui.</p>
      </div>
      <section className="surface vendor-welcome">
        <span className="status-pill approved">Toko disetujui</span>
        <h2>Siap untuk langkah berikutnya.</h2>
        <p>Informasi toko dan produk Anda akan dapat dikelola dari sini.</p>
        <Link className="inline-link" href="/toko">
          Lihat informasi toko ↗
        </Link>
      </section>
    </main>
  );
}
