import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function listUsersRequest(
  options: ApiRequestOptions<"/api/v1/admin/users", "get">,
) {
  return api.GET("/api/v1/admin/users", options);
}
export function updateUserStatusRequest(
  options: ApiRequestOptions<"/api/v1/admin/users/{id}", "put">,
) {
  return api.PUT("/api/v1/admin/users/{id}", options);
}
