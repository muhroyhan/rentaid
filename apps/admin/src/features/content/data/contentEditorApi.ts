import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getAdminContentRequest(
  options: ApiRequestOptions<"/api/v1/admin/content/{key}", "get">,
) {
  return api.GET("/api/v1/admin/content/{key}", options);
}
export function saveAdminContentRequest(
  options: ApiRequestOptions<"/api/v1/admin/content/{key}", "put">,
) {
  return api.PUT("/api/v1/admin/content/{key}", options);
}
export function publishAdminContentRequest(
  options: ApiRequestOptions<"/api/v1/admin/content/{key}/publish", "post">,
) {
  return api.POST("/api/v1/admin/content/{key}/publish", options);
}
export function uploadAdminMediaRequest(options: RequestInit) {
  return fetch("/api/v1/admin/media", options);
}
