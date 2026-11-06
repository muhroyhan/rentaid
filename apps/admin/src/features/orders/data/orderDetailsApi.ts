import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getAdminOrderDetailRequest(
  options: ApiRequestOptions<"/api/v1/admin/orders/{id}", "get">,
) {
  return api.GET("/api/v1/admin/orders/{id}", options);
}
