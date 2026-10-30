import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

mkdirSync(".artifacts", { recursive: true });
const executable =
  process.platform === "win32" ? "rentaid-api.exe" : "rentaid-api";
const result = spawnSync(
  "go",
  [
    "-C",
    "apps/api",
    "build",
    "-o",
    `../../.artifacts/${executable}`,
    "./cmd/rentaid",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
