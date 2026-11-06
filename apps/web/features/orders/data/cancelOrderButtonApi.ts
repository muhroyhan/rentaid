import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getSessionRequest(
  options: ApiRequestOptions<"/api/v1/auth/session", "get">,
) {
  return api.GET("/api/v1/auth/session", options);
}
export function cancelOrderRequest(
  options: ApiRequestOptions<"/api/v1/orders/{id}/cancel", "post">,
) {
  return api.POST("/api/v1/orders/{id}/cancel", options);
}
