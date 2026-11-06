"use client";
import Link from "next/link";
import { labels } from "../StoreForm.model";
import { useStoreForm } from "../application/useStoreForm";

export function StoreForm({ csrfToken }: { csrfToken: string }) {
  const {
    store,
    loading,
    busy,
    editing,
    setEditing,
    name,
    setName,
    address,
    setAddress,
    phone,
    setPhone,
    error,
    notice,
    submit,
    reason,
  } = useStoreForm({ csrfToken });
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
