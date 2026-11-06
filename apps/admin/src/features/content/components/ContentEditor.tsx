import { pages } from "../ContentEditor.model";
import { useContentEditor } from "../application/useContentEditor";

export function ContentEditor({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const {
    selected,
    page,
    setPage,
    busy,
    setDirty,
    notice,
    error,
    save,
    publish,
    upload,
    choose,
  } = useContentEditor({ csrfToken, onExpired });
  return (
    <section className="content-workspace" aria-labelledby="content-heading">
      <div className="section-head">
        <div>
          <span className="eyebrow">MANAJEMEN KONTEN</span>
          <h2 id="content-heading">
            Kelola halaman<span>.</span>
          </h2>
          <p>Siapkan konten dan publikasikan saat sudah siap.</p>
        </div>
        <span className="section-count">05 HALAMAN</span>
      </div>
      <div className="editor-layout">
        <nav className="content-nav" aria-label="Halaman konten">
          {pages.map((item, index) => (
            <button
              key={item.key}
              type="button"
              disabled={busy}
              onClick={() => choose(item.key)}
              className={item.key === selected ? "selected" : ""}
              aria-current={item.key === selected ? "page" : undefined}
            >
              <span className="nav-number">0{index + 1}</span>
              {item.label}
              <span className="nav-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </nav>
        <div className="editor-card">
          <div className="editor-heading">
            <div>
              <span className="eyebrow">EDITOR HALAMAN</span>
              <h3>{pages.find((item) => item.key === selected)?.label}</h3>
            </div>
            {page && (
              <span
                className={"publish-badge" + (page.published ? " live" : "")}
              >
                {page.published ? "Memiliki versi publik" : "Draft"}
              </span>
            )}
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
          {!page && !error && (
            <p className="editor-loading" aria-live="polite">
              Memuat konten...
            </p>
          )}
          {page && (
            <form onSubmit={(event) => void save(event)}>
              <label htmlFor="content-title">Judul</label>
              <input
                id="content-title"
                value={page.title}
                onChange={(event) => {
                  setPage({ ...page, title: event.target.value });
                  setDirty(true);
                }}
                maxLength={200}
                placeholder="Masukkan judul halaman"
                disabled={busy}
              />
              <label htmlFor="content-body">Konten</label>
              <textarea
                id="content-body"
                value={page.body}
                onChange={(event) => {
                  setPage({ ...page, body: event.target.value });
                  setDirty(true);
                }}
                maxLength={50000}
                placeholder="Tulis konten halaman di sini..."
                rows={9}
                disabled={busy}
              />
              <div className="media-heading">
                <label htmlFor="content-image">
                  Gambar halaman <span>OPSIONAL</span>
                </label>
                <span>JPG, PNG, WEBP · MAKS. 5 MB</span>
              </div>
              {page.imageId && (
                <div className="image-preview">
                  <img
                    src={"/api/v1/admin/media/" + page.imageId}
                    alt="Pratinjau gambar halaman"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPage({ ...page, imageId: null });
                      setDirty(true);
                    }}
                    disabled={busy}
                  >
                    Hapus gambar
                  </button>
                </div>
              )}
              <input
                id="content-image"
                className="file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void upload(event)}
                disabled={busy}
              />
              <p className="editor-hint">
                Perubahan draft tidak terlihat publik sampai dipublikasikan.
              </p>
              <div className="editor-actions">
                <button className="secondary" type="submit" disabled={busy}>
                  Simpan draft
                </button>
                <button
                  className="publish-button"
                  type="button"
                  onClick={() => void publish()}
                  disabled={busy}
                >
                  Publikasikan <span aria-hidden="true">↗</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
