import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const spec = readFileSync("packages/contracts/openapi.json");
const embedded = readFileSync("apps/api/internal/httpapi/openapi.json");
if (!spec.equals(embedded)) {
  console.error("Embedded OpenAPI differs. Run pnpm contracts:generate.");
  process.exit(1);
}
const result = spawnSync(
  "pnpm",
  [
    "--filter",
    "@rentaid/contracts",
    "exec",
    "openapi-typescript",
    "openapi.json",
    "--check",
    "-o",
    "../api-client/src/schema.d.ts",
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
process.exit(result.status ?? 1);
