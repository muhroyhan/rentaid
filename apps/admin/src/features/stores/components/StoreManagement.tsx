import { labels } from "../StoreManagement.model";
import { useStoreManagement } from "../application/useStoreManagement";

export function StoreManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const {
    stores,
    detail,
    page,
    setPage,
    reason,
    setReason,
    error,
    busy,
    select,
    decide,
  } = useStoreManagement({ csrfToken, onExpired });
  return (
    <section className="content-panel" aria-label="Antrean toko">
      <h2>Antrean toko</h2>
      <p>Tinjau pengajuan dan kelola status toko.</p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {stores.length === 0 ? (
        <p>Belum ada toko pada halaman ini.</p>
      ) : (
        <ul>
          {stores.map((store) => (
            <li key={store.id}>
              <button className="outline" onClick={() => void select(store.id)}>
                {store.name} — {labels[store.status]}
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
          disabled={stores.length < 20}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
      {detail && (
        <div>
          <h3>{detail.store.name}</h3>
          <p>Alamat: {detail.store.address}</p>
          <p>Telepon: {detail.store.phone}</p>
          <p>ID pemilik: {detail.store.ownerId}</p>
          <p>Status: {labels[detail.store.status]}</p>
          {detail.store.status !== "rejected" && (
            <>
              <label htmlFor="store-reason">
                Alasan (wajib untuk penolakan atau penangguhan)
              </label>
              <textarea
                id="store-reason"
                value={reason}
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
              />
            </>
          )}
          <div>
            {detail.store.status === "pending" && (
              <>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => void decide("approve")}
                >
                  Setujui
                </button>{" "}
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => void decide("reject")}
                >
                  Tolak
                </button>
              </>
            )}
            {detail.store.status === "approved" && (
              <button
                className="outline"
                disabled={busy}
                onClick={() => void decide("suspend")}
              >
                Tangguhkan toko
              </button>
            )}
            {detail.store.status === "suspended" && (
              <button
                className="outline"
                disabled={busy}
                onClick={() => void decide("activate")}
              >
                Aktifkan toko
              </button>
            )}
          </div>
          <h4>Riwayat keputusan</h4>
          <ul>
            {detail.history.map((item, index) => (
              <li key={`${item.createdAt}-${item.actorId}-${index}`}>
                {item.fromStatus ? labels[item.fromStatus] : "Pengajuan"} →{" "}
                {labels[item.toStatus]} {item.reason && `— ${item.reason}`}{" "}
                <small>
                  (
                  {new Date(item.createdAt).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  })}
                  )
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
