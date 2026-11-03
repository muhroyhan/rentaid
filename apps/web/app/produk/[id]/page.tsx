import Link from "next/link";
import { notFound } from "next/navigation";
import { productDetail } from "../../../lib/catalog";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const result = await productDetail(id);
  if (result.missing) notFound();
  if (result.error || !result.value)
    return (
      <main className="section-width page-shell">
        <div className="catalog-state" role="alert">
          <p>Detail produk belum dapat dimuat. Coba lagi sebentar.</p>
          <Link className="inline-link" href={`/produk/${id}`}>
            Coba lagi ↗
          </Link>
        </div>
      </main>
    );
  const product = result.value;
  return (
    <main className="section-width page-shell product-detail">
      <Link href="/katalog" className="inline-link">
        ← Kembali ke katalog
      </Link>
      <div className="detail-layout">
        <div className="detail-gallery">
          {product.photoIds.length ? (
            product.photoIds.map((photo, index) => (
              <div className="detail-photo" key={photo}>
                <img
                  src={`/api/v1/media/${photo}`}
                  alt={`Foto ${product.name} ${index + 1}`}
                />
              </div>
            ))
          ) : (
            <div
              className="detail-photo detail-placeholder"
              aria-label="Foto produk belum tersedia"
            >
              <span aria-hidden="true">✳</span>
            </div>
          )}
        </div>
        <div className="detail-info">
          <span className="eyebrow">{product.categoryName}</span>
          <h1>
            {product.name}
            <span className="accent-dot">.</span>
          </h1>
          <p className="detail-store">
            Disediakan oleh <strong>{product.storeName}</strong>
          </p>
          <div className="detail-price">
            <strong>{currency.format(product.dailyPrice)}</strong>
            <span> / hari</span>
          </div>
          <p className="detail-stock">
            {product.stock > 0
              ? `Stok tersedia: ${product.stock}`
              : "Stok sedang tidak tersedia"}
          </p>
          <div className="detail-section">
            <span className="eyebrow">TENTANG PRODUK</span>
            <h2>Deskripsi</h2>
            <p className="content-copy">{product.description}</p>
          </div>
          <div className="detail-section">
            <span className="eyebrow">LOKASI PENGAMBILAN</span>
            <h2>{product.storeName}</h2>
            <p className="content-copy">{product.storeAddress}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
