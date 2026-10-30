import createClient from "openapi-fetch";
import type { paths } from "./schema.js";
export type { components } from "./schema.js";

export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}
