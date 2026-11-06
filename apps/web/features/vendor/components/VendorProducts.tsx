"use client";
import { currency } from "../VendorProducts.model";
import { useVendorProducts } from "../application/useVendorProducts";
import { ProductForm } from "./ProductForm";

export function VendorProducts({ csrfToken }: { csrfToken: string }) {
  const {
    items,
    categories,
    page,
    setPage,
    loading,
    categoriesLoading,
    categoryError,
    busy,
    error,
    notice,
    setNotice,
    editor,
    setEditor,
    change,
    saved,
  } = useVendorProducts({ csrfToken });
  return (
    <div className="vendor-products">
      <section className="surface" aria-label="Daftar produk">
        <div className="product-heading">
          <div>
            <span className="eyebrow">KOLEKSI TOKO ANDA</span>
            <h2>Produk saya</h2>
            <p>Kelola informasi, foto, dan publikasi produk Anda.</p>
          </div>
          <button
            className="button button-dark"
            disabled={busy || categoriesLoading || !!categoryError || !!editor}
            onClick={() => {
              setEditor({ kind: "new" });
              setNotice("");
            }}
          >
            Tambah produk <span>↗</span>
          </button>
        </div>
        {categoryError && (
          <div className="alert" role="alert">
            {categoryError}
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {loading ? (
          <p className="product-empty">Memuat produk...</p>
        ) : !items.length ? (
          <p className="product-empty">
            Belum ada produk di halaman ini. Tambahkan produk untuk mulai
            mengelola katalog toko.
          </p>
        ) : (
          <ul className="vendor-product-list">
            {items.map((product) => (
              <li className="vendor-product" key={product.id}>
                <div className="vendor-product-photo">
                  {product.photoIds[0] ? (
                    <img
                      src={`/api/v1/vendor/media/${product.photoIds[0]}`}
                      alt={`Foto ${product.name}`}
                    />
                  ) : (
                    <span aria-hidden="true">✳</span>
                  )}
                </div>
                <div className="vendor-product-body">
                  <div className="vendor-product-top">
                    <div>
                      <h3>{product.name}</h3>
                      <p>
                        {product.categoryName} ·{" "}
                        {currency.format(product.dailyPrice)} / hari · Stok{" "}
                        {product.stock}
                      </p>
                    </div>
                    <div className="product-badges">
                      <span className="status-pill">
                        {product.archived
                          ? "Diarsipkan"
                          : product.published
                            ? "Terbit"
                            : "Draft"}
                      </span>
                      {product.hidden && (
                        <span className="status-pill rejected">
                          Disembunyikan admin
                        </span>
                      )}
                    </div>
                  </div>
                  {product.hidden && (
                    <p className="moderation-note">
                      Produk disembunyikan oleh admin dan tidak tampil di
                      katalog publik.
                    </p>
                  )}
                  <div className="vendor-product-actions">
                    <button
                      type="button"
                      disabled={
                        busy || categoriesLoading || !!categoryError || !!editor
                      }
                      onClick={() => {
                        setEditor({ kind: "edit", product });
                        setNotice("");
                      }}
                    >
                      Edit
                    </button>
                    {!product.archived && (
                      <button
                        type="button"
                        disabled={busy || !!editor}
                        onClick={() =>
                          void change(
                            product,
                            "publication",
                            !product.published,
                          )
                        }
                      >
                        {product.published ? "Hentikan publikasi" : "Terbitkan"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy || !!editor}
                      onClick={() =>
                        void change(product, "archive", !product.archived)
                      }
                    >
                      {product.archived ? "Pulihkan" : "Arsipkan"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="vendor-pagination">
          <button
            type="button"
            className="plain-button"
            disabled={page === 1 || loading || !!editor}
            onClick={() => setPage((current) => current - 1)}
          >
            ← Sebelumnya
          </button>
          <span>Halaman {page}</span>
          <button
            type="button"
            className="plain-button"
            disabled={items.length < 20 || loading || !!editor}
            onClick={() => setPage((current) => current + 1)}
          >
            Berikutnya →
          </button>
        </div>
      </section>
      {editor && (
        <ProductForm
          key={editor.kind === "edit" ? editor.product.id : "new"}
          product={editor.kind === "edit" ? editor.product : null}
          categories={categories}
          csrfToken={csrfToken}
          onSaved={saved}
          onCancel={() => setEditor(null)}
        />
      )}
    </div>
  );
}
