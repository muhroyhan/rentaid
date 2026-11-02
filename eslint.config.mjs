import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "apps/web/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/admin/**/*.{ts,tsx}", "apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "apps/web/next-env.d.ts",
      "apps/api/**",
      "packages/**",
      "infra/**",
      "tests/**",
    ],
  },
];
