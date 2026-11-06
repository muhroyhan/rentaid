import type { ApiRequestOptions } from "@rentaid/api-client";
import { api } from "../../../lib/api";
export function logoutRequest(
  options: ApiRequestOptions<"/api/v1/auth/logout", "post">,
) {
  return api.POST("/api/v1/auth/logout", options);
}
