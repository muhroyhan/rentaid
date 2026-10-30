import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  { files: ["scripts/**/*.mjs"], languageOptions: { globals: globals.node } },
  {
    ignores: [
      "**/node_modules/**",
      "apps/**",
      "packages/**",
      "infra/**",
      "tests/**",
    ],
  },
];
