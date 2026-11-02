import { createApiClient, type components } from "@rentaid/api-client";
import { useCallback, useEffect, useState } from "react";

const api = createApiClient(window.location.origin);
type Store = components["schemas"]["Store"];
type Detail = components["schemas"]["StoreDetail"];
type Action = components["schemas"]["StoreDecisionInput"]["action"];
const labels: Record<Store["status"], string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  suspended: "Ditangguhkan",
};

export function StoreManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const [stores, setStores] = useState<Store[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await api.GET("/api/v1/admin/stores", {
        params: { query: { page, page_size: 20 } },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error();
      setStores(result.data);
    } catch {
      setError("Daftar toko tidak dapat dimuat.");
    }
  }, [page, onExpired]);
  useEffect(() => {
    void load();
  }, [load]);
  async function select(id: string) {
    try {
      const result = await api.GET("/api/v1/admin/stores/{id}", {
        params: { path: { id } },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error();
      setDetail(result.data);
      setReason("");
      setError("");
    } catch {
      setError("Detail toko tidak dapat dimuat.");
    }
  }
  async function decide(action: Action) {
    if (!detail) return;
    if ((action === "reject" || action === "suspend") && !reason.trim()) {
      setError("Isi alasan penolakan atau penangguhan.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.POST("/api/v1/admin/stores/{id}/decision", {
        params: { path: { id: detail.store.id } },
        headers: { "X-CSRF-Token": csrfToken },
        body: { action, reason },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Keputusan tidak dapat disimpan.",
        );
      await load();
      await select(detail.store.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Keputusan tidak dapat disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
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
