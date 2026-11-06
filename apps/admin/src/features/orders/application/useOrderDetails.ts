import { useEffect, useState } from "react";
import { getAdminOrderDetailRequest } from "../data/orderDetailsApi";
import { Detail } from "../OrderDetails.model";
export function useOrderDetails({
  id,
  onExpired,
}: {
  id: string;
  onExpired: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await getAdminOrderDetailRequest({
          params: { path: { id } },
        });
        if (!active) return;
        if (result.response.status === 401) {
          onExpired();
          return;
        }
        if (!result.data) throw new Error();
        setDetail(result.data);
      } catch {
        if (active) setError("Detail pesanan tidak dapat dimuat.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id, onExpired]);
  return { detail, error };
}
