import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getProductQuoteRequest(
  options: ApiRequestOptions<"/api/v1/products/{id}/quote", "get">,
) {
  return api.GET("/api/v1/products/{id}/quote", options);
}
export function getSessionRequest(
  options: ApiRequestOptions<"/api/v1/auth/session", "get">,
) {
  return api.GET("/api/v1/auth/session", options);
}
export function checkoutRequest(
  options: ApiRequestOptions<"/api/v1/checkout", "post">,
) {
  return api.POST("/api/v1/checkout", options);
}
