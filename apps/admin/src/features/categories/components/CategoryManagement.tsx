import { useCategoryManagement } from "../application/useCategoryManagement";

export function CategoryManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const {
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
  } = useCategoryManagement({ csrfToken, onExpired });
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
