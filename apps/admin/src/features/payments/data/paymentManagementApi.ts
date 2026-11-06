import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function listAdminPaymentsRequest(
  options: ApiRequestOptions<"/api/v1/admin/payments", "get">,
) {
  return api.GET("/api/v1/admin/payments", options);
}
export function getAdminPaymentRequest(
  options: ApiRequestOptions<"/api/v1/admin/payments/{id}", "get">,
) {
  return api.GET("/api/v1/admin/payments/{id}", options);
}
