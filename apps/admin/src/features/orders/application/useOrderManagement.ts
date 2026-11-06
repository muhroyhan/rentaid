import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelOrderRequest,
  listAdminOrdersRequest,
} from "../data/orderManagementApi";
import { Order } from "../OrderManagement.model";
export function useOrderManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const [items, setItems] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Order["status"] | "">("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await listAdminOrdersRequest({
        params: {
          query: { page, page_size: 20, ...(status ? { status } : {}) },
        },
      });
      if (version !== requestVersion.current) return;
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error();
      setItems(result.data);
    } catch {
      if (version === requestVersion.current) {
        setItems([]);
        setError("Daftar pesanan tidak dapat dimuat.");
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [page, status, onExpired]);
  useEffect(() => {
    void load();
    return () => {
      requestVersion.current++;
    };
  }, [load]);
  async function cancel(item: Order) {
    if (item.status !== "confirmed" && item.status !== "pending_payment")
      return;
    setBusy(true);
    setError("");
    try {
      const result = await cancelOrderRequest({
        params: { path: { id: item.id } },
        headers: { "X-CSRF-Token": csrfToken },
        body: { expectedStatus: item.status },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data)
        setError(result.error?.message ?? "Pesanan tidak dapat dibatalkan.");
      await load();
    } catch {
      setError("Pesanan tidak dapat dibatalkan.");
    } finally {
      setBusy(false);
    }
  }
  return {
    items,
    page,
    setPage,
    status,
    setStatus,
    selected,
    setSelected,
    error,
    busy,
    loading,
    cancel,
  };
}
