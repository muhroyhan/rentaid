import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Key, Page } from "../ContentEditor.model";
import {
  getAdminContentRequest,
  publishAdminContentRequest,
  saveAdminContentRequest,
  uploadAdminMediaRequest,
} from "../data/contentEditorApi";
export function useContentEditor({
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
        const result = await getAdminContentRequest({
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
    const result = await saveAdminContentRequest({
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
      const result = await publishAdminContentRequest({
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
      const response = await uploadAdminMediaRequest({
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
  return {
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
  };
}
