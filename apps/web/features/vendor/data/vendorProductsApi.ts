import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function listVendorProductsRequest(
  options: ApiRequestOptions<"/api/v1/vendor/products", "get">,
) {
  return api.GET("/api/v1/vendor/products", options);
}
export function listCategoriesRequest(
  options: ApiRequestOptions<"/api/v1/categories", "get">,
) {
  return api.GET("/api/v1/categories", options);
}
export function setProductPublicationRequest(
  options: ApiRequestOptions<"/api/v1/vendor/products/{id}/publication", "put">,
) {
  return api.PUT("/api/v1/vendor/products/{id}/publication", options);
}
export function setProductArchiveRequest(
  options: ApiRequestOptions<"/api/v1/vendor/products/{id}/archive", "put">,
) {
  return api.PUT("/api/v1/vendor/products/{id}/archive", options);
}
