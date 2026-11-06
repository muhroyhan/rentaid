import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function listRenterOrdersRequest(
  options: ApiRequestOptions<"/api/v1/orders", "get">,
) {
  return api.GET("/api/v1/orders", options);
}
