import { useUserManagement } from "../application/useUserManagement";

export function UserManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const {
    users,
    selected,
    setSelected,
    page,
    setPage,
    error,
    busy,
    changeStatus,
  } = useUserManagement({ csrfToken, onExpired });
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
