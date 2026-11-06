"use client";
import { Category, Product } from "../ProductForm.model";
import { useProductForm } from "../application/useProductForm";

export function ProductForm({
  product,
  categories,
  csrfToken,
  onSaved,
  onCancel,
}: {
  product: Product | null;
  categories: Category[];
  csrfToken: string;
  onSaved: (product: Product) => void;
  onCancel: () => void;
}) {
  const {
    name,
    setName,
    description,
    setDescription,
    categoryId,
    setCategoryId,
    price,
    setPrice,
    stock,
    setStock,
    photos,
    setPhotos,
    busy,
    error,
    notice,
    headingRef,
    cancel,
    upload,
    save,
  } = useProductForm({ product, csrfToken, onSaved, onCancel });
  return (
    <section
      className="surface product-editor"
      aria-label={product ? "Edit produk" : "Produk baru"}
    >
      <div className="surface-title">
        <div>
          <span className="eyebrow">INFORMASI PRODUK</span>
          <h2 ref={headingRef} tabIndex={-1}>
            {product ? "Edit produk" : "Produk baru"}
          </h2>
        </div>
        <span aria-hidden="true">✳</span>
      </div>
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
      {!categories.length && (
        <div className="alert">
          Belum ada kategori. Minta admin menambahkan kategori sebelum membuat
          produk.
        </div>
      )}
      <form className="stack-form" onSubmit={(event) => void save(event)}>
        <label htmlFor="product-name">Nama produk</label>
        <input
          id="product-name"
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="product-description">Deskripsi</label>
        <textarea
          id="product-description"
          required
          maxLength={10000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <label htmlFor="product-category">Kategori</label>
        <select
          id="product-category"
          required
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Pilih kategori</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <div className="product-numbers">
          <div>
            <label htmlFor="product-price">Harga harian (Rp)</label>
            <input
              id="product-price"
              type="number"
              min="1"
              max="9007199254740991"
              step="1"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="product-stock">Stok</label>
            <input
              id="product-stock"
              type="number"
              min="0"
              max="2147483647"
              step="1"
              required
              value={stock}
              onChange={(event) => setStock(event.target.value)}
            />
          </div>
        </div>
        <label htmlFor="product-photos">
          Foto produk <span className="optional">(opsional)</span>
        </label>
        <p className="field-hint">
          JPEG, PNG, atau WebP; maksimal 5 MB per foto dan 10 foto per produk.
        </p>
        <input
          id="product-photos"
          className="photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy || photos.length >= 10}
          onChange={(event) => void upload(event)}
        />
        {photos.length > 0 && (
          <div className="vendor-photos">
            {photos.map((id, index) => (
              <div key={id} className="vendor-photo">
                <img
                  src={`/api/v1/vendor/media/${id}`}
                  alt={`Foto produk ${index + 1}`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setPhotos((current) =>
                      current.filter((item) => item !== id),
                    )
                  }
                  aria-label={`Hapus foto ${index + 1}`}
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="product-form-actions">
          <button
            className="button button-dark"
            type="submit"
            disabled={busy || !categories.length}
          >
            {busy
              ? "Memproses..."
              : product
                ? "Simpan perubahan"
                : "Simpan produk"}
            <span>↗</span>
          </button>
          <button
            className="plain-button"
            type="button"
            disabled={busy}
            onClick={cancel}
          >
            Batal
          </button>
        </div>
      </form>
    </section>
  );
}
