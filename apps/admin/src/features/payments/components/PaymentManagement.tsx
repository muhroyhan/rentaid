import { currency, labels } from "../PaymentManagement.model";
import { usePaymentManagement } from "../application/usePaymentManagement";

export function PaymentManagement({ onExpired }: { onExpired: () => void }) {
  const { items, detail, page, setPage, error, select } = usePaymentManagement({
    onExpired,
  });
  return (
    <section className="content-panel" aria-label="Transaksi">
      <h2>Transaksi pembayaran</h2>
      <p>Hasil pembayaran simulasi untuk seluruh toko.</p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <p>Belum ada transaksi pada halaman ini.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button className="outline" onClick={() => void select(item.id)}>
                {item.orderCode} · {labels[item.status]} ·{" "}
                {currency.format(item.amount)}
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
        Halaman {page}{" "}
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
          <h3>Detail transaksi {detail.orderCode}</h3>
          <p>
            {detail.productName} · {detail.storeName}
          </p>
          <p>Status: {labels[detail.status]}</p>
          <p>Jumlah: {currency.format(detail.amount)}</p>
          <p>
            {new Intl.DateTimeFormat("id-ID", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "Asia/Jakarta",
            }).format(new Date(detail.createdAt))}{" "}
            WIB
          </p>
        </div>
      )}
    </section>
  );
}
