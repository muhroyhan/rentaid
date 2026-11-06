import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function listAdminOrdersRequest(
  options: ApiRequestOptions<"/api/v1/admin/orders", "get">,
) {
  return api.GET("/api/v1/admin/orders", options);
}
export function cancelOrderRequest(
  options: ApiRequestOptions<"/api/v1/orders/{id}/cancel", "post">,
) {
  return api.POST("/api/v1/orders/{id}/cancel", options);
}
