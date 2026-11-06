import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getOrderRequest(
  options: ApiRequestOptions<"/api/v1/orders/{id}", "get">,
) {
  return api.GET("/api/v1/orders/{id}", options);
}
export function getSessionRequest(
  options: ApiRequestOptions<"/api/v1/auth/session", "get">,
) {
  return api.GET("/api/v1/auth/session", options);
}
export function simulatePaymentRequest(
  options: ApiRequestOptions<"/api/v1/payment-simulator", "post">,
) {
  return api.POST("/api/v1/payment-simulator", options);
}
