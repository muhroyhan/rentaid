import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function listStoresRequest(
  options: ApiRequestOptions<"/api/v1/admin/stores", "get">,
) {
  return api.GET("/api/v1/admin/stores", options);
}
export function getStoreDetailRequest(
  options: ApiRequestOptions<"/api/v1/admin/stores/{id}", "get">,
) {
  return api.GET("/api/v1/admin/stores/{id}", options);
}
export function decideStoreRequest(
  options: ApiRequestOptions<"/api/v1/admin/stores/{id}/decision", "post">,
) {
  return api.POST("/api/v1/admin/stores/{id}/decision", options);
}
