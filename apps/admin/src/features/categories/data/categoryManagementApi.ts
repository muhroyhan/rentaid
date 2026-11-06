import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function listCategoriesRequest(
  options: ApiRequestOptions<"/api/v1/categories", "get">,
) {
  return api.GET("/api/v1/categories", options);
}
export function updateCategoryRequest(
  options: ApiRequestOptions<"/api/v1/admin/categories/{id}", "put">,
) {
  return api.PUT("/api/v1/admin/categories/{id}", options);
}
export function createCategoryRequest(
  options: ApiRequestOptions<"/api/v1/admin/categories", "post">,
) {
  return api.POST("/api/v1/admin/categories", options);
}
export function deleteCategoryRequest(
  options: ApiRequestOptions<"/api/v1/admin/categories/{id}", "delete">,
) {
  return api.DELETE("/api/v1/admin/categories/{id}", options);
}
