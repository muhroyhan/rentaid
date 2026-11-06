import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createStoreRequest,
  getOwnStoreHistoryRequest,
  getOwnStoreRequest,
  resubmitStoreRequest,
} from "../data/storeFormApi";
import { History, Store } from "../StoreForm.model";
export function useStoreForm({ csrfToken }: { csrfToken: string }) {
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
      const result = await getOwnStoreRequest();
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
        const h = await getOwnStoreHistoryRequest();
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
        ? await resubmitStoreRequest({
            headers: { "X-CSRF-Token": csrfToken },
            body,
          })
        : await createStoreRequest({
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
  return {
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
  };
}
