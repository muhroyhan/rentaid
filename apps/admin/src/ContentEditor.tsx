import { createApiClient } from "@rentaid/api-client";
import type { components } from "@rentaid/api-client";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

const api = createApiClient(window.location.origin);
const pages = [
  { key: "home", label: "Beranda" },
  { key: "faq", label: "FAQ" },
  { key: "about", label: "Tentang" },
  { key: "terms", label: "Syarat penggunaan" },
  { key: "privacy", label: "Kebijakan privasi" },
] as const;
type Key = (typeof pages)[number]["key"];
type Page = components["schemas"]["Page"];

export function ContentEditor({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const [selected, setSelected] = useState<Key>("home");
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setPage(null);
    setError("");
    setNotice("");
    void (async () => {
      try {
        const result = await api.GET("/api/v1/admin/content/{key}", {
          params: { path: { key: selected } },
        });
        if (!active) return;
        if (result.response.status === 401) {
          onExpired();
          return;
        }
        if (result.error || !result.data)
          throw new Error(
            result.error?.message ?? "Konten tidak dapat dimuat.",
          );
        setPage(result.data);
        setDirty(false);
      } catch {
        if (active) setError("Konten tidak dapat dimuat. Muat ulang halaman.");
      }
    })();
    return () => {
      active = false;
    };
  }, [selected, onExpired]);

  async function persist() {
    if (!page) throw new Error("Konten belum tersedia.");
    const result = await api.PUT("/api/v1/admin/content/{key}", {
      params: { path: { key: selected } },
      headers: { "X-CSRF-Token": csrfToken },
      body: { title: page.title, body: page.body, imageId: page.imageId },
    });
    if (result.response.status === 401) {
      onExpired();
      throw new Error("Sesi berakhir.");
    }
    if (result.error || !result.data)
      throw new Error(result.error?.message ?? "Draft tidak dapat disimpan.");
    setPage(result.data);
    setDirty(false);
    return result.data;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await persist();
      setNotice("Draft berhasil disimpan.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft tidak dapat disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!page) return;
    if (!page.title.trim() || !page.body.trim()) {
      setError("Isi judul dan konten sebelum memublikasikan.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await persist();
      const result = await api.POST("/api/v1/admin/content/{key}/publish", {
        params: { path: { key: selected } },
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (result.error || !result.data)
        throw new Error(
          result.error?.message ?? "Konten tidak dapat dipublikasikan.",
        );
      setPage(result.data);
      setNotice("Konten berhasil dipublikasikan.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Konten tidak dapat dipublikasikan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !page) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/media", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-CSRF-Token": csrfToken,
        },
        body: file,
      });
      if (response.status === 401) {
        onExpired();
        return;
      }
      const data = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !data.id)
        throw new Error(data.message ?? "Gambar tidak dapat diunggah.");
      setPage({ ...page, imageId: data.id });
      setDirty(true);
      setNotice("Gambar diunggah. Simpan draft untuk menggunakannya.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Gambar tidak dapat diunggah.",
      );
    } finally {
      setBusy(false);
    }
  }

  function choose(key: Key) {
    if (key === selected) return;
    if (dirty && !window.confirm("Perubahan belum disimpan. Pindah halaman?"))
      return;
    setSelected(key);
  }

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
