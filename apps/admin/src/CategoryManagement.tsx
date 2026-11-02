import { createApiClient, type components } from "@rentaid/api-client";
import { useCallback, useEffect, useState, type FormEvent } from "react";

const api = createApiClient(window.location.origin);
type Category = components["schemas"]["Category"];

export function CategoryManagement({
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
      const result = await api.GET("/api/v1/categories", {
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
        ? await api.PUT("/api/v1/admin/categories/{id}", {
            params: { path: { id: editing.id } },
            headers: { "X-CSRF-Token": csrfToken },
            body: { name },
          })
        : await api.POST("/api/v1/admin/categories", {
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
      const result = await api.DELETE("/api/v1/admin/categories/{id}", {
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
  return (
    <section className="content-panel" aria-label="Kategori">
      <h2>Kategori</h2>
      <p>Kelola kategori yang tersedia untuk produk.</p>
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
      <form onSubmit={(event) => void save(event)}>
        <label htmlFor="category-name">Nama kategori</label>
        <input
          id="category-name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <button className="outline" type="submit" disabled={busy}>
          {editing ? "Simpan perubahan" : "Tambah kategori"}
        </button>
        {editing && (
          <button
            className="outline"
            type="button"
            onClick={() => {
              setEditing(null);
              setName("");
              setError("");
            }}
          >
            Batal edit
          </button>
        )}
      </form>
      {categories.length === 0 ? (
        <p>Belum ada kategori pada halaman ini.</p>
      ) : (
        <ul>
          {categories.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>{" "}
              <button
                className="outline"
                disabled={busy}
                onClick={() => {
                  setEditing(item);
                  setName(item.name);
                  setError("");
                  setNotice("");
                }}
                aria-label={`Edit ${item.name}`}
              >
                Edit
              </button>{" "}
              <button
                className="outline"
                disabled={busy}
                onClick={() => void remove(item)}
                aria-label={`Hapus ${item.name}`}
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          className="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Sebelumnya
        </button>{" "}
        <span>Halaman {page}</span>{" "}
        <button
          className="outline"
          disabled={categories.length < 20}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </section>
  );
}
