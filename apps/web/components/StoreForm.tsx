"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { components } from "@rentaid/api-client";
import { api } from "../lib/api";
type Store = components["schemas"]["Store"];
type History = components["schemas"]["StoreDetail"]["history"];
const labels: Record<Store["status"], string> = {
  pending: "Menunggu persetujuan",
  approved: "Disetujui",
  rejected: "Perlu diperbaiki",
  suspended: "Ditangguhkan",
};
export function StoreForm({ csrfToken }: { csrfToken: string }) {
  const [store, setStore] = useState<Store | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await api.GET("/api/v1/store");
      if (result.response.status === 401) {
        window.location.assign("/masuk");
        return;
      }
      if (result.response.status === 404) {
        setStore(null);
        return;
      }
      if (!result.data) throw new Error();
      setStore(result.data);
      setName(result.data.name);
      setAddress(result.data.address);
      setPhone(result.data.phone);
      if (
        result.data.status === "rejected" ||
        result.data.status === "suspended"
      ) {
        const h = await api.GET("/api/v1/store/history");
        if (h.data) setHistory(h.data.history);
      }
    } catch {
      setError("Status toko tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = { name, address, phone };
      const result = store
        ? await api.PUT("/api/v1/store", {
            headers: { "X-CSRF-Token": csrfToken },
            body,
          })
        : await api.POST("/api/v1/store", {
            headers: { "X-CSRF-Token": csrfToken },
            body,
          });
      if (result.response.status === 401) {
        window.location.assign("/masuk");
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Pengajuan tidak dapat disimpan.",
        );
      setStore(result.data);
      setHistory([]);
      setEditing(false);
      setNotice("Pengajuan toko berhasil dikirim.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Pengajuan tidak dapat disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  const reason = history
    .filter((item) => item.toStatus === store?.status && item.reason)
    .at(-1)?.reason;
  if (loading) return <p>Memuat status toko...</p>;
  return (
    <>
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
      {store && !editing ? (
        <div className="store-status">
          <span className={`status-pill ${store.status}`}>
            {labels[store.status]}
          </span>
          <h3>{store.name}</h3>
          <p>{store.address}</p>
          <p>{store.phone}</p>
          {store.status === "pending" && (
            <p>Tim kami sedang meninjau pengajuan toko Anda.</p>
          )}
          {reason && (
            <div className="reason">
              <strong>Catatan admin</strong>
              <p>{reason}</p>
            </div>
          )}
          {store.status === "approved" && (
            <Link className="button button-dark" href="/vendor">
              Buka dashboard vendor <span>↗</span>
            </Link>
          )}
          {store.status === "rejected" && (
            <button
              className="button button-dark"
              onClick={() => setEditing(true)}
            >
              Perbaiki dan ajukan ulang <span>↗</span>
            </button>
          )}
          {store.status === "suspended" && (
            <p>
              Toko sedang ditangguhkan. Silakan hubungi tim Rentaid untuk
              informasi lebih lanjut.
            </p>
          )}
        </div>
      ) : (
        <form className="stack-form" onSubmit={(e) => void submit(e)}>
          <label htmlFor="store-name">Nama toko</label>
          <input
            id="store-name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor="store-address">Alamat toko</label>
          <textarea
            id="store-address"
            required
            maxLength={500}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <label htmlFor="store-phone">Nomor telepon toko</label>
          <input
            id="store-phone"
            required
            type="tel"
            maxLength={40}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button className="button button-dark" type="submit" disabled={busy}>
            {busy
              ? "Mengirim..."
              : store
                ? "Kirim pengajuan ulang"
                : "Kirim pengajuan toko"}
            <span>↗</span>
          </button>
          {editing && (
            <button
              className="plain-button"
              type="button"
              onClick={() => setEditing(false)}
            >
              Batal
            </button>
          )}
        </form>
      )}
    </>
  );
}
