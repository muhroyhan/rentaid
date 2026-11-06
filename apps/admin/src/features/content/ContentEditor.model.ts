import type { components } from "@rentaid/api-client";
export const pages = [
  { key: "home", label: "Beranda" },
  { key: "faq", label: "FAQ" },
  { key: "about", label: "Tentang" },
  { key: "terms", label: "Syarat penggunaan" },
  { key: "privacy", label: "Kebijakan privasi" },
] as const;
export type Key = (typeof pages)[number]["key"];
export type Page = components["schemas"]["Page"];
