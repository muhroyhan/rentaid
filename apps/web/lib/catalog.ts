import { createApiClient, type components } from "@rentaid/api-client";

export type Product = components["schemas"]["Product"];
export type Category = components["schemas"]["Category"];
export type ContentPage = components["schemas"]["Page"];
const api = createApiClient(process.env.API_ORIGIN ?? "http://127.0.0.1:8080");

type Result<T> = { value: T; error: false } | { value: null; error: true };

export async function homeContent(): Promise<Result<ContentPage | null>> {
  try {
    const result = await api.GET("/api/v1/content/{key}", {
      params: { path: { key: "home" } },
      cache: "no-store",
    });
    if (result.response.status === 404) return { value: null, error: false };
    if (!result.data) throw new Error();
    return { value: result.data, error: false };
  } catch {
    return { value: null, error: true };
  }
}

export async function products(options: {
  page: number;
  pageSize: number;
  q?: string;
  categoryId?: string;
}): Promise<Result<Product[]>> {
  try {
    const result = await api.GET("/api/v1/products", {
      params: {
        query: {
          page: options.page,
          page_size: options.pageSize,
          ...(options.q ? { q: options.q } : {}),
          ...(options.categoryId ? { category_id: options.categoryId } : {}),
        },
      },
      cache: "no-store",
    });
    if (!result.data) throw new Error();
    return { value: result.data, error: false };
  } catch {
    return { value: null, error: true };
  }
}

export async function productDetail(
  id: string,
): Promise<{ value: Product | null; missing: boolean; error: boolean }> {
  try {
    const result = await api.GET("/api/v1/products/{id}", {
      params: { path: { id } },
      cache: "no-store",
    });
    if (result.response.status === 404 || result.response.status === 400)
      return { value: null, missing: true, error: false };
    if (!result.data) throw new Error();
    return { value: result.data, missing: false, error: false };
  } catch {
    return { value: null, missing: false, error: true };
  }
}

export async function categories(): Promise<Result<Category[]>> {
  try {
    const all: Category[] = [];
    for (let page = 1; ; page++) {
      const result = await api.GET("/api/v1/categories", {
        params: { query: { page, page_size: 50 } },
        cache: "no-store",
      });
      if (!result.data) throw new Error();
      all.push(...result.data);
      if (result.data.length < 50) break;
    }
    return { value: all, error: false };
  } catch {
    return { value: null, error: true };
  }
}
