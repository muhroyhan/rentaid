import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getRenterOrderDetailRequest(
  options: ApiRequestOptions<"/api/v1/orders/{id}/detail", "get">,
) {
  return api.GET("/api/v1/orders/{id}/detail", options);
}
export function getVendorOrderDetailRequest(
  options: ApiRequestOptions<"/api/v1/vendor/orders/{id}", "get">,
) {
  return api.GET("/api/v1/vendor/orders/{id}", options);
}
