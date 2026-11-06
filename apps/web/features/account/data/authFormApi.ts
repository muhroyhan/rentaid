import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getLoginCsrfRequest() {
  return api.GET("/api/v1/auth/csrf");
}
export function registerRequest(
  options: ApiRequestOptions<"/api/v1/auth/register", "post">,
) {
  return api.POST("/api/v1/auth/register", options);
}
export function loginRequest(
  options: ApiRequestOptions<"/api/v1/auth/login", "post">,
) {
  return api.POST("/api/v1/auth/login", options);
}
