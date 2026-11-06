import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Category } from "../CategoryManagement.model";
import {
  createCategoryRequest,
  deleteCategoryRequest,
  listCategoriesRequest,
  updateCategoryRequest,
} from "../data/categoryManagementApi";
export function useCategoryManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await listCategoriesRequest({
        params: { query: { page, page_size: 20 } },
      });
      if (!result.data) throw new Error("Daftar kategori tidak dapat dimuat.");
      setCategories(result.data);
    } catch {
      setError("Daftar kategori tidak dapat dimuat.");
    }
  }, [page]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!name.trim()) {
      setError("Isi nama kategori.");
      return;
    }
    setBusy(true);
    try {
      const result = editing
        ? await updateCategoryRequest({
            params: { path: { id: editing.id } },
            headers: { "X-CSRF-Token": csrfToken },
            body: { name },
          })
        : await createCategoryRequest({
            headers: { "X-CSRF-Token": csrfToken },
            body: { name },
          });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Kategori tidak dapat disimpan.",
        );
      setName("");
      setEditing(null);
      setNotice("Kategori berhasil disimpan.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Kategori tidak dapat disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: Category) {
    if (!window.confirm(`Hapus kategori ${item.name}?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await deleteCategoryRequest({
        params: { path: { id: item.id } },
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Kategori tidak dapat dihapus.",
        );
      if (editing?.id === item.id) {
        setEditing(null);
        setName("");
      }
      setNotice("Kategori berhasil dihapus.");
      if (categories.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Kategori tidak dapat dihapus.",
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    categories,
    page,
    setPage,
    name,
    setName,
    editing,
    setEditing,
    busy,
    error,
    setError,
    notice,
    setNotice,
    save,
    remove,
  };
}
