import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getProfileRequest() {
  return api.GET("/api/v1/profile");
}
export function updateProfileRequest(
  options: ApiRequestOptions<"/api/v1/profile", "put">,
) {
  return api.PUT("/api/v1/profile", options);
}
