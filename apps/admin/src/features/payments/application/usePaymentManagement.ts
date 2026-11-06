import { useCallback, useEffect, useState } from "react";
import {
  getAdminPaymentRequest,
  listAdminPaymentsRequest,
} from "../data/paymentManagementApi";
import { Payment } from "../PaymentManagement.model";
export function usePaymentManagement({ onExpired }: { onExpired: () => void }) {
  const [items, setItems] = useState<Payment[]>([]);
  const [detail, setDetail] = useState<Payment | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await listAdminPaymentsRequest({
        params: { query: { page, page_size: 20 } },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error();
      setItems(result.data);
      setError("");
    } catch {
      setError("Daftar transaksi tidak dapat dimuat.");
    }
  }, [onExpired, page]);
  useEffect(() => {
    void load();
  }, [load]);
  async function select(id: string) {
    try {
      const result = await getAdminPaymentRequest({
        params: { path: { id } },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error();
      setDetail(result.data);
      setError("");
    } catch {
      setError("Detail transaksi tidak dapat dimuat.");
    }
  }
  return { items, detail, page, setPage, error, select };
}
