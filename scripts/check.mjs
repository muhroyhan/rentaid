import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const banned = new RegExp(["rag", "gam"].join(""), "i");
const skip = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".gradle",
]);
function scan(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const child = join(path, entry.name);
    if (banned.test(entry.name))
      throw new Error("Legacy brand in path: " + child);
    if (entry.isDirectory()) scan(child);
    else if (entry.isFile()) {
      const content = readFileSync(child);
      if (!content.includes(0) && banned.test(content.toString("utf8"))) {
        throw new Error("Legacy brand in file: " + child);
      }
    }
  }
}
for (const path of ["apps", "packages", "infra", "tests"]) {
  try {
    scan(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const commands = [
  ["pnpm", ["contracts:check"]],
  ["pnpm", ["--filter", "@rentaid/api-client", "typecheck"]],
  ["pnpm", ["exec", "eslint", "scripts"]],
  [
    "pnpm",
    [
      "exec",
      "prettier",
      "--check",
      "package.json",
      "pnpm-workspace.yaml",
      "eslint.config.mjs",
      "scripts/*.mjs",
      "packages/contracts/*.json",
      "packages/api-client/*.json",
      "packages/api-client/src/index.ts",
      "infra/*.yaml",
    ],
  ],
  ["go", ["-C", "apps/api", "vet", "./..."]],
  [
    "docker",
    [
      "run",
      "--rm",
      "--mount",
      `type=bind,source=${resolve("apps/api")},target=/app`,
      "--workdir",
      "/app",
      "golangci/golangci-lint:v2.15.0",
      "golangci-lint",
      "run",
      "./...",
    ],
  ],
  ["go", ["-C", "apps/api", "test", "./..."]],
];
const formatted = spawnSync("gofmt", ["-l", "apps/api"], { encoding: "utf8" });
if (formatted.status !== 0 || formatted.stdout.trim()) {
  console.error("Run gofmt:", formatted.stdout, formatted.stderr);
  process.exit(1);
}
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32" && command === "pnpm",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
