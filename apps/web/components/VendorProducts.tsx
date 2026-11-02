"use client";
import { useCallback, useEffect, useState } from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../lib/api";
import { ProductForm } from "./ProductForm";

type Product = components["schemas"]["Product"];
type Category = components["schemas"]["Category"];
type Editor = { kind: "new" } | { kind: "edit"; product: Product } | null;
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function VendorProducts({ csrfToken }: { csrfToken: string }) {
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.GET("/api/v1/vendor/products", {
        params: { query: { page, page_size: 20 } },
      });
      if (result.response.status === 401) {
        window.location.assign("/masuk");
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Daftar produk tidak dapat dimuat.",
        );
      setItems(result.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Daftar produk tidak dapat dimuat.",
      );
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const all: Category[] = [];
        let next = 1;
        while (true) {
          const result = await api.GET("/api/v1/categories", {
            params: { query: { page: next, page_size: 50 } },
          });
          if (!result.data) throw new Error("Kategori tidak dapat dimuat.");
          all.push(...result.data);
          if (result.data.length < 50) break;
          next++;
        }
        if (active) setCategories(all);
      } catch {
        if (active)
          setCategoryError("Kategori tidak dapat dimuat. Muat ulang halaman.");
      } finally {
        if (active) setCategoriesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function change(
    product: Product,
    action: "publication" | "archive",
    value: boolean,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const options = {
        params: { path: { id: product.id } },
        headers: { "X-CSRF-Token": csrfToken },
        body: { value },
      };
      const result =
        action === "publication"
          ? await api.PUT("/api/v1/vendor/products/{id}/publication", options)
          : await api.PUT("/api/v1/vendor/products/{id}/archive", options);
      if (result.response.status === 401) {
        window.location.assign("/masuk");
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Status produk tidak dapat diubah.",
        );
      setItems((current) =>
        current.map((item) => (item.id === product.id ? result.data! : item)),
      );
      setNotice(
        action === "publication"
          ? value
            ? "Produk berhasil diterbitkan."
            : "Publikasi produk dihentikan."
          : value
            ? "Produk berhasil diarsipkan."
            : "Produk dipulihkan sebagai draft.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Status produk tidak dapat diubah.",
      );
    } finally {
      setBusy(false);
    }
  }

  function saved(product: Product) {
    setEditor(null);
    setNotice(`Produk ${product.name} berhasil disimpan.`);
    if (page !== 1 && !items.some((item) => item.id === product.id)) setPage(1);
    else void load();
  }

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
