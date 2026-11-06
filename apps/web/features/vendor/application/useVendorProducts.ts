import { useCallback, useEffect, useState } from "react";
import {
  listCategoriesRequest,
  listVendorProductsRequest,
  setProductArchiveRequest,
  setProductPublicationRequest,
} from "../data/vendorProductsApi";
import { Category, Editor, Product } from "../VendorProducts.model";
export function useVendorProducts({ csrfToken }: { csrfToken: string }) {
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
      const result = await listVendorProductsRequest({
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
          const result = await listCategoriesRequest({
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
          ? await setProductPublicationRequest(options)
          : await setProductArchiveRequest(options);
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
  return {
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
  };
}
