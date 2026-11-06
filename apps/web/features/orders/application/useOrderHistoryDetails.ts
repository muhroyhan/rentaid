import { useEffect, useState } from "react";
import {
  getRenterOrderDetailRequest,
  getVendorOrderDetailRequest,
} from "../data/orderHistoryDetailsApi";
import { Detail } from "../OrderHistoryDetails.model";
export function useOrderHistoryDetails({
  id,
  scope,
}: {
  id: string;
  scope: "renter" | "vendor";
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result =
          scope === "renter"
            ? await getRenterOrderDetailRequest({
                params: { path: { id } },
                cache: "no-store",
              })
            : await getVendorOrderDetailRequest({
                params: { path: { id } },
                cache: "no-store",
              });
        if (active) {
          if (result.data) setDetail(result.data);
          else
            setError(
              result.error?.message ?? "Detail pesanan tidak dapat dimuat.",
            );
        }
      } catch {
        if (active) setError("Detail pesanan tidak dapat dimuat.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id, scope]);
  return { detail, error };
}
