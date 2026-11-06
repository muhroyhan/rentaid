import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { demo } from "../../../scripts/demo.mjs";
import { freePort, requireEnv, run } from "../../support/process.mjs";

requireEnv(["CHROME_PATH"]);
const suffix = randomBytes(6).toString("hex");
const password = randomBytes(18).toString("hex");
const adminPassword = randomBytes(18).toString("hex");
const env = {
  ...process.env,
  RENTAID_COMPOSE_PROJECT: `rentaid-browser-${suffix}`,
  RENTAID_HTTP_PORT: await freePort(),
  RENTAID_DB_PORT: await freePort(),
  SEED_ADMIN_EMAIL: "browser-admin@example.test",
  SEED_ADMIN_PASSWORD: adminPassword,
  SEED_DEMO_PASSWORD: password,
  E2E_ADMIN_EMAIL: "browser-admin@example.test",
  E2E_ADMIN_PASSWORD: adminPassword,
  E2E_VENDOR_PASSWORD: password,
};
const origin = `http://127.0.0.1:${env.RENTAID_HTTP_PORT}`;
Object.assign(env, {
  E2E_BASE_URL: origin,
  E2E_WEB_URL: origin,
  E2E_ADMIN_URL: origin,
});
const ops = demo(env);
const scenarios = [
  "admin-content",
  "admin-browser",
  "admin-stores",
  "admin-categories",
  "admin-products",
  "marketplace-account",
  "vendor-products",
  "product-quote",
  "checkout",
  "payment",
  "cancellation",
  "handover",
  "return",
  "order-history",
  "public-catalog",
];
let owned = false;
try {
  assert.match(ops.project, /^rentaid-browser-[0-9a-f]{12}$/);
  if (await ops.run(["ps", "-a", "--services"], { capture: true }))
    throw new Error("Test project already exists.");
  if (
    (
      await run(
        "docker",
        [
          "volume",
          "ls",
          "-q",
          "--filter",
          `label=com.docker.compose.project=${ops.project}`,
        ],
        { capture: true },
      )
    ).trim()
  ) {
    throw new Error("Test project already has volumes.");
  }
  owned = true;
  await ops.up();
  for (const [index, scenario] of scenarios.entries()) {
    if (index > 0) {
      console.log(
        "Resetting the isolated test database before the next scenario.",
      );
      await ops.run([
        "exec",
        "-T",
        "postgres",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "rentaid",
        "-d",
        "rentaid",
        "-c",
        "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
      ]);
      await ops.run(["restart", "api"]);
      await ops.run(["up", "-d", "--wait", "--wait-timeout", "180"]);
      await ops.seed();
    }
    console.log(`Running browser scenario: ${scenario}`);
    await run(process.execPath, [`tests/e2e/web/test-${scenario}.mjs`], {
      env,
    });
  }
} finally {
  if (owned) await ops.run(["down", "--volumes", "--remove-orphans"]);
}
await run(process.execPath, ["tests/e2e/cross/test-demo.mjs"], { env });
