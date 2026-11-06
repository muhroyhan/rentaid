import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getOwnStoreRequest() {
  return api.GET("/api/v1/store");
}
export function getOwnStoreHistoryRequest() {
  return api.GET("/api/v1/store/history");
}
export function resubmitStoreRequest(
  options: ApiRequestOptions<"/api/v1/store", "put">,
) {
  return api.PUT("/api/v1/store", options);
}
export function createStoreRequest(
  options: ApiRequestOptions<"/api/v1/store", "post">,
) {
  return api.POST("/api/v1/store", options);
}
