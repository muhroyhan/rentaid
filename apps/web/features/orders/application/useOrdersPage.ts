import { useCallback, useEffect, useRef, useState } from "react";
import { listRenterOrdersRequest } from "../data/ordersPageApi";
import { Order } from "../OrdersPage.model";
import { type OrderStatus } from "../presentation";
export function useOrdersPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await listRenterOrdersRequest({
        params: {
          query: { page, page_size: 20, ...(status ? { status } : {}) },
        },
        cache: "no-store",
      });
      if (version !== requestVersion.current) return;
      if (result.data) {
        setItems(result.data);
        setError("");
      } else
        setError(
          result.response.status === 401
            ? "Silakan masuk untuk melihat pesanan."
            : (result.error?.message ?? "Pesanan tidak dapat dimuat."),
        );
    } catch {
      if (version === requestVersion.current)
        setError("Pesanan tidak dapat dimuat.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [page, status]);
  useEffect(() => {
    void load();
    return () => {
      requestVersion.current++;
    };
  }, [load]);
  return { items, status, setStatus, page, setPage, error, loading };
}
