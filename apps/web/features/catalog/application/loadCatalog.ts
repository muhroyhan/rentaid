import { categories, products } from "../data/catalog";

const pageSize = 12;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CatalogSearch = {
  q?: string | string[];
  category_id?: string | string[];
  page?: string | string[];
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function parseCatalogSearch(params: CatalogSearch) {
  const q = single(params.q).trim();
  const category = single(params.category_id).toLowerCase();
  const rawPage = single(params.page);
  const page = rawPage ? Number(rawPage) : 1;
  const validCategory = category !== "" && uuid.test(category);
  const invalid =
    (rawPage !== "" && !/^[0-9]+$/.test(rawPage)) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > Math.floor((Number.MAX_SAFE_INTEGER - pageSize) / pageSize) ||
    Array.from(q).length > 200 ||
    (category !== "" && !validCategory);
  return { q, category, page, invalid, validCategory };
}

export function catalogLink(q: string, category: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category_id", category);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/katalog?${query}` : "/katalog";
}

export async function loadCatalog(params: CatalogSearch) {
  const search = parseCatalogSearch(params);
  const { q, category, page, invalid } = search;
  const options = { page, pageSize, q, categoryId: category };
  const [categoryData, current, next] = await Promise.all([
    categories(),
    invalid ? Promise.resolve(null) : products(options),
    invalid ? Promise.resolve(null) : products({ ...options, page: page + 1 }),
  ]);
  return { ...search, categoryData, current, next };
}
