import Link from "next/link";
import type { Product } from "../lib/catalog";
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="catalog-card">
      <Link
        className="catalog-card-link"
        href={`/produk/${product.id}`}
        prefetch={false}
      >
        <div className="catalog-image">
          {product.photoIds[0] ? (
            <img src={`/api/v1/media/${product.photoIds[0]}`} alt="" />
          ) : (
            <span aria-hidden="true">✳</span>
          )}
          <span className="catalog-category">{product.categoryName}</span>
        </div>
        <div className="catalog-card-content">
          <span className="catalog-store">{product.storeName}</span>
          <h3>{product.name}</h3>
          <div className="catalog-card-bottom">
            <span>
              <strong>{currency.format(product.dailyPrice)}</strong>{" "}
              <small>/ hari</small>
            </span>
            <span aria-hidden="true">↗</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
