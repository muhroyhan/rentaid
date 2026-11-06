import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function listVendorOrdersRequest(
  options: ApiRequestOptions<"/api/v1/vendor/orders", "get">,
) {
  return api.GET("/api/v1/vendor/orders", options);
}
export function getSessionRequest(
  options: ApiRequestOptions<"/api/v1/auth/session", "get">,
) {
  return api.GET("/api/v1/auth/session", options);
}
export function handoverOrderRequest(
  options: ApiRequestOptions<"/api/v1/vendor/orders/{id}/handover", "post">,
) {
  return api.POST("/api/v1/vendor/orders/{id}/handover", options);
}
export function returnOrderRequest(
  options: ApiRequestOptions<"/api/v1/vendor/orders/{id}/return", "post">,
) {
  return api.POST("/api/v1/vendor/orders/{id}/return", options);
}
