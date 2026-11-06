import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function uploadVendorMediaRequest(options: RequestInit) {
  return fetch("/api/v1/vendor/media", options);
}
export function updateVendorProductRequest(
  options: ApiRequestOptions<"/api/v1/vendor/products/{id}", "put">,
) {
  return api.PUT("/api/v1/vendor/products/{id}", options);
}
export function createVendorProductRequest(
  options: ApiRequestOptions<"/api/v1/vendor/products", "post">,
) {
  return api.POST("/api/v1/vendor/products", options);
}
