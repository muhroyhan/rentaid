import Link from "next/link";
import { ProductCard } from "../../components/ProductCard";
import { categories, products } from "../../lib/catalog";

const pageSize = 12;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Search = {
  q?: string | string[];
  category_id?: string | string[];
  page?: string | string[];
};
function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
function linkTo(q: string, category: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category_id", category);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/katalog?${query}` : "/katalog";
}
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const q = single(params.q).trim();
  const category = single(params.category_id).toLowerCase();
  const rawPage = single(params.page);
  const page = rawPage ? Number(rawPage) : 1;
  const invalid =
    (rawPage !== "" && !/^[0-9]+$/.test(rawPage)) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > Math.floor((Number.MAX_SAFE_INTEGER - pageSize) / pageSize) ||
    Array.from(q).length > 200 ||
    (category !== "" && !uuid.test(category));
  const options = { page, pageSize, q, categoryId: category };
  const categoryResult = categories();
  const currentResult = invalid ? Promise.resolve(null) : products(options);
  const nextResult = invalid
    ? Promise.resolve(null)
    : products({ ...options, page: page + 1 });
  const [categoryData, current, next] = await Promise.all([
    categoryResult,
    currentResult,
    nextResult,
  ]);
  return (
    <main className="section-width page-shell catalog-page">
      <div className="page-heading">
        <span className="eyebrow">UNTUK SETIAP RENCANA</span>
        <h1>
          Temukan yang <em>Anda butuhkan.</em>
        </h1>
        <p>Jelajahi pilihan produk dari toko-toko di Rentaid.</p>
      </div>
      <form className="catalog-filters" action="/katalog" method="get">
        <div>
          <label htmlFor="catalog-search">Cari produk</label>
          <input
            id="catalog-search"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={q}
            placeholder="Cari nama atau deskripsi"
          />
        </div>
        <div>
          <label htmlFor="catalog-category">Kategori</label>
          <select
            id="catalog-category"
            name="category_id"
            defaultValue={category && uuid.test(category) ? category : ""}
          >
            <option value="">Semua kategori</option>
            {category &&
              uuid.test(category) &&
              !categoryData.value?.some(
                (item) => item.id.toLowerCase() === category.toLowerCase(),
              ) && <option value={category}>Kategori tidak tersedia</option>}
            {categoryData.value?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <button className="button button-dark" type="submit">
          Cari produk <span>↗</span>
        </button>
      </form>
      {categoryData.error && (
        <div className="alert" role="alert">
          Kategori belum dapat dimuat. Coba muat ulang halaman.
        </div>
      )}
      {invalid ? (
        <div className="catalog-state" role="alert">
          <p>Pencarian, kategori, atau nomor halaman tidak valid.</p>
          <Link className="inline-link" href="/katalog">
            Kembali ke katalog ↗
          </Link>
        </div>
      ) : current?.error || next?.error ? (
        <div className="catalog-state" role="alert">
          <p>Produk belum dapat dimuat. Coba lagi sebentar.</p>
          <Link className="inline-link" href={linkTo(q, category, page)}>
            Coba lagi ↗
          </Link>
        </div>
      ) : current && !current.error && next && !next.error ? (
        <>
          <div className="catalog-results-heading">
            <span className="eyebrow">PRODUK TERSEDIA</span>
            <span>Halaman {page}</span>
          </div>
          {current.value.length ? (
            <div className="catalog-grid">
              {current.value.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          ) : (
            <div className="catalog-state">
              <p>
                {q || category
                  ? "Tidak ada produk yang cocok dengan pencarian Anda."
                  : "Belum ada produk yang tersedia saat ini."}
              </p>
              {(q || category || page > 1) && (
                <Link className="inline-link" href="/katalog">
                  Lihat semua produk ↗
                </Link>
              )}
            </div>
          )}
          <nav className="catalog-pagination" aria-label="Halaman katalog">
            {page > 1 && (
              <Link
                className="inline-link"
                href={linkTo(q, category, page - 1)}
              >
                ← Sebelumnya
              </Link>
            )}
            <span>Halaman {page}</span>
            {next.value.length > 0 && (
              <Link
                className="inline-link"
                href={linkTo(q, category, page + 1)}
              >
                Berikutnya →
              </Link>
            )}
          </nav>
        </>
      ) : null}
    </main>
  );
}
