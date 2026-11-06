import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const kind = process.argv[2];
if (!["unit", "integration"].includes(kind)) {
  throw new Error("Expected unit or integration.");
}
if (kind === "integration" && !process.env.TEST_DATABASE_URL) {
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated PostgreSQL test database.",
  );
}
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
    ...(kind === "integration" ? ["-tags=integration", "-count=1"] : []),
    "./...",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      TEST_DATABASE_URL: kind === "integration" ? url : "",
    },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
