import { copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  ["--filter", "@rentaid/contracts", "generate"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);
copyFileSync(
  "packages/contracts/openapi.json",
  "apps/api/internal/httpapi/openapi.json",
);
