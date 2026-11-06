import createClient from "openapi-fetch";
import type { paths } from "./schema.js";
import type { FetchOptions } from "openapi-fetch";
export type { components } from "./schema.js";

export type ApiRequestOptions<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> = FetchOptions<paths[Path][Method]>;

export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}
