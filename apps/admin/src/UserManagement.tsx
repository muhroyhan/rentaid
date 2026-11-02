import { createApiClient, type components } from "@rentaid/api-client";
import { useCallback, useEffect, useState } from "react";

const api = createApiClient(window.location.origin);
type Profile = components["schemas"]["Profile"];

export function UserManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await api.GET("/api/v1/admin/users", {
        params: { query: { page, page_size: 20 } },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error(result.error?.message);
      setUsers(result.data);
    } catch {
      setError("Daftar pengguna tidak dapat dimuat.");
    }
  }, [page, onExpired]);
  useEffect(() => {
    void load();
  }, [load]);
  async function changeStatus() {
    if (!selected) return;
    const status = selected.status === "active" ? "suspended" : "active";
    setBusy(true);
    setError("");
    try {
      const result = await api.PUT("/api/v1/admin/users/{id}", {
        params: { path: { id: selected.id } },
        headers: { "X-CSRF-Token": csrfToken },
        body: { status },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error(result.error?.message);
      setSelected(result.data);
      await load();
    } catch {
      setError("Status pengguna tidak dapat diubah.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-panel" aria-label="Pengguna">
      <h2>Pengguna</h2>
      <p>Pilih pengguna untuk melihat detail dan mengelola akses.</p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {users.length === 0 ? (
        <p>Belum ada pengguna pada halaman ini.</p>
      ) : (
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              <button className="outline" onClick={() => setSelected(user)}>
                {user.name || user.email} —{" "}
                {user.status === "active" ? "Aktif" : "Ditangguhkan"}
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
          disabled={users.length < 20}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
      {selected && (
        <div>
          <h3>Detail pengguna</h3>
          <p>Nama: {selected.name || "—"}</p>
          <p>Email: {selected.email}</p>
          <p>Telepon: {selected.phone || "—"}</p>
          <p>
            Status: {selected.status === "active" ? "Aktif" : "Ditangguhkan"}
          </p>
          <button
            className="outline"
            disabled={busy}
            onClick={() => void changeStatus()}
          >
            {selected.status === "active"
              ? "Tangguhkan pengguna"
              : "Aktifkan pengguna"}
          </button>
        </div>
      )}
    </section>
  );
}
