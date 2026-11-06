import { useCallback, useEffect, useState } from "react";
import {
  listUsersRequest,
  updateUserStatusRequest,
} from "../data/userManagementApi";
import { Profile } from "../UserManagement.model";
export function useUserManagement({
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
      const result = await listUsersRequest({
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
      const result = await updateUserStatusRequest({
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
  return {
    users,
    selected,
    setSelected,
    page,
    setPage,
    error,
    busy,
    changeStatus,
  };
}
