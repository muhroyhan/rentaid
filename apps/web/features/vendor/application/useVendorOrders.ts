import { useCallback, useEffect, useRef, useState } from "react";
import { type OrderStatus } from "../../orders/presentation";
import {
  getSessionRequest,
  handoverOrderRequest,
  listVendorOrdersRequest,
  returnOrderRequest,
} from "../data/vendorOrdersApi";
import { Order } from "../VendorOrders.model";
export function useVendorOrders() {
  const [items, setItems] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [handoverBusy, setHandoverBusy] = useState("");
  const [returnBusy, setReturnBusy] = useState("");
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await listVendorOrdersRequest({
        params: {
          query: { page, page_size: 20, ...(status ? { status } : {}) },
        },
        cache: "no-store",
      });
      if (version !== requestVersion.current) return;
      if (result.data) {
        setItems(result.data);
        setError("");
      } else {
        setItems([]);
        setError(result.error?.message ?? "Pesanan tidak dapat dimuat.");
      }
    } catch {
      if (version === requestVersion.current) {
        setItems([]);
        setError("Pesanan tidak dapat dimuat.");
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [page, status]);
  async function handover(id: string) {
    if (handoverBusy) return;
    setHandoverBusy(id);
    setError("");
    try {
      const session = await getSessionRequest({
        cache: "no-store",
      });
      if (!session.data) {
        setError("Silakan masuk kembali.");
        return;
      }
      const result = await handoverOrderRequest({
        params: { path: { id } },
        headers: { "X-CSRF-Token": session.data.csrfToken },
      });
      if (!result.data) {
        setError(result.error?.message ?? "Serah terima tidak berhasil.");
        return;
      }
      await load();
    } catch {
      setError("Serah terima tidak berhasil. Coba lagi.");
    } finally {
      setHandoverBusy("");
    }
  }
  async function confirmReturn(id: string) {
    if (returnBusy) return;
    setReturnBusy(id);
    setError("");
    try {
      const session = await getSessionRequest({
        cache: "no-store",
      });
      if (!session.data) {
        setError("Silakan masuk kembali.");
        return;
      }
      const result = await returnOrderRequest({
        params: { path: { id } },
        headers: { "X-CSRF-Token": session.data.csrfToken },
      });
      if (!result.data) {
        setError(result.error?.message ?? "Pengembalian tidak berhasil.");
        return;
      }
      await load();
    } catch {
      setError("Pengembalian tidak berhasil. Coba lagi.");
    } finally {
      setReturnBusy("");
    }
  }
  useEffect(() => {
    void load();
    return () => {
      requestVersion.current++;
    };
  }, [load]);
  return {
    items,
    page,
    setPage,
    status,
    setStatus,
    selected,
    setSelected,
    error,
    handoverBusy,
    returnBusy,
    loading,
    load,
    handover,
    confirmReturn,
  };
}
