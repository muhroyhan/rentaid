import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const url = (process.env.TEST_DATABASE_URL ?? "").replace(
  /@(localhost|127\.0\.0\.1)(?=[:/])/,
  "@host.docker.internal",
);
const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--mount",
    `type=bind,source=${resolve("apps/api")},target=/app`,
    "--workdir",
    "/app",
    "--env",
    "TEST_DATABASE_URL",
    "golangci/golangci-lint:v2.15.0",
    "go",
    "test",
    "./...",
  ],
  { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: url } },
);
process.exit(result.status ?? 1);
