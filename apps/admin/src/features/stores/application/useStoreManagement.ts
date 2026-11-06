import { useCallback, useEffect, useState } from "react";
import {
  decideStoreRequest,
  getStoreDetailRequest,
  listStoresRequest,
} from "../data/storeManagementApi";
import { Action, Detail, Store } from "../StoreManagement.model";
export function useStoreManagement({
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
      const result = await listStoresRequest({
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
      const result = await getStoreDetailRequest({
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
      const result = await decideStoreRequest({
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
  return {
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
  };
}
