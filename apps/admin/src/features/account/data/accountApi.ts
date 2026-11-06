import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function getSessionRequest() {
  return api.GET("/api/v1/auth/session");
}
export function getLoginCsrfRequest() {
  return api.GET("/api/v1/auth/csrf");
}
export function loginRequest(
  options: ApiRequestOptions<"/api/v1/auth/login", "post">,
) {
  return api.POST("/api/v1/auth/login", options);
}
export function logoutRequest(
  options: ApiRequestOptions<"/api/v1/auth/logout", "post">,
) {
  return api.POST("/api/v1/auth/logout", options);
}
