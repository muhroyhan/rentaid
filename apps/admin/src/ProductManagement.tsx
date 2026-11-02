import { createApiClient, type components } from "@rentaid/api-client";
import { useCallback, useEffect, useState } from "react";

const api = createApiClient(window.location.origin);
type Product = components["schemas"]["Product"];
type Detail = components["schemas"]["ProductDetail"];
export function ProductManagement({
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
      const result = await api.GET("/api/v1/admin/products", {
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
      const result = await api.GET("/api/v1/admin/products/{id}", {
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
      const result = await api.POST("/api/v1/admin/products/{id}/moderation", {
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
  return (
    <section className="content-panel" aria-label="Produk">
      <h2>Produk</h2>
      <p>Tinjau produk dan kelola moderasi katalog.</p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <p>Belum ada produk pada halaman ini.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button className="outline" onClick={() => void select(item.id)}>
                {item.name} - {item.storeName}{" "}
                {item.hidden ? "(Disembunyikan)" : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          className="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Sebelumnya
        </button>{" "}
        <span>Halaman {page}</span>{" "}
        <button
          className="outline"
          disabled={items.length < 20}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
      {detail && (
        <div>
          <h3>{detail.product.name}</h3>
          <p>Toko: {detail.product.storeName}</p>
          <p>Kategori: {detail.product.categoryName}</p>
          <p>{detail.product.description}</p>
          <p>
            Harga per hari:{" "}
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              maximumFractionDigits: 0,
            }).format(detail.product.dailyPrice)}
          </p>
          <p>Stok: {detail.product.stock}</p>
          <p>
            Publikasi: {detail.product.published ? "Diterbitkan" : "Draft"};{" "}
            {detail.product.archived ? "Diarsipkan" : "Tidak diarsipkan"};{" "}
            {detail.product.hidden
              ? "Disembunyikan admin"
              : "Tidak disembunyikan"}
          </p>
          {detail.product.photoIds.length > 0 && (
            <div className="product-photos">
              {detail.product.photoIds.map((id) => (
                <img
                  key={id}
                  alt={`Foto ${detail.product.name}`}
                  src={`/api/v1/admin/media/${id}`}
                />
              ))}
            </div>
          )}
          <label htmlFor="product-reason">Alasan moderasi</label>
          <textarea
            id="product-reason"
            value={reason}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
          />
          <button
            className="outline"
            disabled={busy}
            onClick={() => void moderate()}
          >
            {detail.product.hidden
              ? "Aktifkan kembali produk"
              : "Sembunyikan produk"}
          </button>
          <h4>Riwayat moderasi</h4>
          <ul>
            {detail.history.map((item, index) => (
              <li key={`${item.createdAt}-${item.actorId}-${index}`}>
                {item.hidden ? "Disembunyikan" : "Diaktifkan kembali"} -{" "}
                {item.reason}{" "}
                <small>
                  (
                  {new Date(item.createdAt).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  })}
                  )
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
