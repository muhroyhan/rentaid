"use client";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../lib/api";

type Product = components["schemas"]["Product"];
type Category = components["schemas"]["Category"];
type ProductInput = components["schemas"]["ProductInput"];
const maxPhotoBytes = 5 * 1024 * 1024;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [price, setPrice] = useState(product ? String(product.dailyPrice) : "");
  const [stock, setStock] = useState(product ? String(product.stock) : "");
  const [photos, setPhotos] = useState<string[]>(product?.photoIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const dirty =
    name !== (product?.name ?? "") ||
    description !== (product?.description ?? "") ||
    categoryId !== (product?.categoryId ?? "") ||
    price !== (product ? String(product.dailyPrice) : "") ||
    stock !== (product ? String(product.stock) : "") ||
    JSON.stringify(photos) !== JSON.stringify(product?.photoIds ?? []);
  function cancel() {
    if (
      dirty &&
      !window.confirm("Perubahan belum disimpan. Tinggalkan formulir?")
    )
      return;
    onCancel();
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    setNotice("");
    if (photos.length + files.length > 10) {
      setError("Maksimal 10 foto untuk setiap produk.");
      return;
    }
    if (
      files.some(
        (file) =>
          (file.type !== "" && !acceptedTypes.has(file.type)) ||
          file.size === 0 ||
          file.size > maxPhotoBytes,
      )
    ) {
      setError(
        "Pilih gambar JPEG, PNG, atau WebP dengan ukuran maksimal 5 MB per foto.",
      );
      return;
    }
    setBusy(true);
    let uploaded = 0;
    try {
      for (const file of files) {
        const response = await fetch("/api/v1/vendor/media", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-CSRF-Token": csrfToken,
          },
          body: file,
        });
        if (response.status === 401) {
          window.location.assign("/masuk");
          return;
        }
        const body = (await response.json().catch(() => ({}))) as {
          id?: string;
          message?: string;
        };
        if (!response.ok || !body.id)
          throw new Error(body.message ?? "Foto tidak dapat diunggah.");
        const id = body.id;
        setPhotos((current) => [...current, id]);
        uploaded++;
      }
      setNotice(`${uploaded} foto berhasil diunggah.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Foto tidak dapat diunggah.",
      );
      if (uploaded)
        setNotice(
          `${uploaded} foto berhasil diunggah sebelum terjadi kesalahan.`,
        );
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const dailyPrice = Number(price);
    const amount = Number(stock);
    if (
      !name.trim() ||
      !description.trim() ||
      !categoryId ||
      price === "" ||
      stock === "" ||
      !Number.isSafeInteger(dailyPrice) ||
      dailyPrice <= 0 ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      amount > 2147483647
    ) {
      setError(
        "Isi data produk dengan harga harian positif dan stok berupa bilangan bulat tidak negatif.",
      );
      return;
    }
    const body: ProductInput = {
      name,
      description,
      categoryId,
      dailyPrice,
      stock: amount,
      photoIds: photos,
    };
    setBusy(true);
    try {
      const result = product
        ? await api.PUT("/api/v1/vendor/products/{id}", {
            params: { path: { id: product.id } },
            headers: { "X-CSRF-Token": csrfToken },
            body,
          })
        : await api.POST("/api/v1/vendor/products", {
            headers: { "X-CSRF-Token": csrfToken },
            body,
          });
      if (result.response.status === 401) {
        window.location.assign("/masuk");
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Produk tidak dapat disimpan.",
        );
      onSaved(result.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Produk tidak dapat disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }

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
