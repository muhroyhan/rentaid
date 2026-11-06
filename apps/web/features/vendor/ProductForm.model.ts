import type { components } from "@rentaid/api-client";
export type Product = components["schemas"]["Product"];
export type Category = components["schemas"]["Category"];
export type ProductInput = components["schemas"]["ProductInput"];
export const maxPhotoBytes = 5 * 1024 * 1024;
export const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
