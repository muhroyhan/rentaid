import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function listAdminProductsRequest(
  options: ApiRequestOptions<"/api/v1/admin/products", "get">,
) {
  return api.GET("/api/v1/admin/products", options);
}
export function getAdminProductRequest(
  options: ApiRequestOptions<"/api/v1/admin/products/{id}", "get">,
) {
  return api.GET("/api/v1/admin/products/{id}", options);
}
export function moderateProductRequest(
  options: ApiRequestOptions<"/api/v1/admin/products/{id}/moderation", "post">,
) {
  return api.POST("/api/v1/admin/products/{id}/moderation", options);
}
