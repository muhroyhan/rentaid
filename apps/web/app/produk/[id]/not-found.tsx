import Link from "next/link";
export default function NotFound() {
  return (
    <main className="section-width page-shell">
      <div className="catalog-state">
        <span className="eyebrow">PRODUK TIDAK DITEMUKAN</span>
        <h1>Produk belum tersedia.</h1>
        <p>Produk mungkin sudah tidak tersedia di katalog.</p>
        <Link className="button button-dark" href="/katalog">
          Kembali ke katalog <span>↗</span>
        </Link>
      </div>
    </main>
  );
}
