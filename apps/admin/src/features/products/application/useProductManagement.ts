import { useCallback, useEffect, useState } from "react";
import {
  getAdminProductRequest,
  listAdminProductsRequest,
  moderateProductRequest,
} from "../data/productManagementApi";
import { Detail, Product } from "../ProductManagement.model";
export function useProductManagement({
  csrfToken,
  onExpired,
}: {
  csrfToken: string;
  onExpired: () => void;
}) {
  const [items, setItems] = useState<Product[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await listAdminProductsRequest({
        params: { query: { page, page_size: 20 } },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data) throw new Error();
      setItems(result.data);
    } catch {
      setError("Daftar produk tidak dapat dimuat.");
    }
  }, [onExpired, page]);
  useEffect(() => {
    void load();
  }, [load]);
  async function select(id: string) {
    try {
      const result = await getAdminProductRequest({
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
      setError("Detail produk tidak dapat dimuat.");
    }
  }
  async function moderate() {
    if (!detail) return;
    if (!reason.trim()) {
      setError("Isi alasan moderasi.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await moderateProductRequest({
        params: { path: { id: detail.product.id } },
        headers: { "X-CSRF-Token": csrfToken },
        body: { hidden: !detail.product.hidden, reason },
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Moderasi tidak dapat disimpan.",
        );
      await load();
      await select(detail.product.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Moderasi tidak dapat disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    items,
    detail,
    page,
    setPage,
    reason,
    setReason,
    error,
    busy,
    select,
    moderate,
  };
}
