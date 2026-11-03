import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { demo } from "./demo.mjs";
import { completeDemo, verifyDemo } from "./demo-browser.mjs";
async function freePort() {
  return await new Promise((success, failure) => {
    const server = createServer();
    server.once("error", failure);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? failure(error) : success(String(port))));
    });
  });
}
if (!process.env.CHROME_PATH)
  throw new Error("Tetapkan CHROME_PATH untuk Chrome/Chromium lokal.");
const suffix = randomBytes(6).toString("hex");
const password = randomBytes(18).toString("hex"),
  adminPassword = randomBytes(18).toString("hex");
const base = {
  ...process.env,
  SEED_ADMIN_EMAIL: "demo-admin@example.test",
  SEED_ADMIN_PASSWORD: adminPassword,
  SEED_DEMO_PASSWORD: password,
};
const sourceEnv = {
  ...base,
  RENTAID_COMPOSE_PROJECT: `rentaid-test-${suffix}`,
  RENTAID_HTTP_PORT: await freePort(),
  RENTAID_DB_PORT: await freePort(),
};
const targetEnv = {
  ...base,
  RENTAID_COMPOSE_PROJECT: `rentaid-test-restore-${suffix}`,
  RENTAID_HTTP_PORT: await freePort(),
  RENTAID_DB_PORT: await freePort(),
};
const source = demo(sourceEnv),
  target = demo(targetEnv);
const credentials = {
  chrome: process.env.CHROME_PATH,
  adminEmail: base.SEED_ADMIN_EMAIL,
  adminPassword,
  password,
};
const artifactRoot = resolve(".artifacts", "demo-tests", suffix);
mkdirSync(artifactRoot, { recursive: true });
const backup = resolve(artifactRoot, "backup");
const origin = `http://127.0.0.1:${sourceEnv.RENTAID_HTTP_PORT}`,
  restoredOrigin = `http://127.0.0.1:${targetEnv.RENTAID_HTTP_PORT}`;
async function counts(ops) {
  return await ops.run(
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "rentaid",
      "-d",
      "rentaid",
      "-At",
      "-c",
      "SELECT json_build_object('users',(SELECT count(*) FROM users),'stores',(SELECT count(*) FROM stores),'products',(SELECT count(*) FROM products),'categories',(SELECT count(*) FROM categories),'orders',(SELECT count(*) FROM orders))",
    ],
    { capture: true },
  );
}
const owned = new Set();
let completed = false;
try {
  for (const ops of [source, target]) {
    assert.match(ops.project, /^rentaid-test-(?:restore-)?[0-9a-f]{12}$/);
    assert.equal(
      execFileSync(
        "docker",
        [
          "volume",
          "ls",
          "-q",
          "--filter",
          `label=com.docker.compose.project=${ops.project}`,
        ],
        { encoding: "utf8" },
      ).trim(),
      "",
    );
    const services = await ops.run(["ps", "-a", "--services"], {
      capture: true,
    });
    assert.equal(services, "");
    owned.add(ops);
  }
  console.log("Starting a fresh isolated Compose demo.");
  await source.up();
  const seeded = await counts(source);
  await source.seed();
  assert.equal(
    await counts(source),
    seeded,
    "Repeated seed changed the initial demo.",
  );
  const proof = await completeDemo(origin, credentials);
  const before = await counts(source);
  await source.seed();
  assert.equal(
    await counts(source),
    before,
    "Seed changed demo data after use.",
  );
  await source.run(["restart", "api", "web", "gateway"]);
  await source.run(["up", "-d", "--wait", "--wait-timeout", "180"]);
  await verifyDemo(origin, credentials, proof);
  await source.backup(backup);
  await verifyDemo(origin, credentials, proof);
  let refused = false;
  try {
    await source.restore(backup);
  } catch {
    refused = true;
  }
  assert.ok(refused, "Restore should refuse a running populated target.");
  assert.equal(await counts(source), before);
  console.log(
    "Restoring database and media into another empty Compose project.",
  );
  await target.restore(backup);
  await verifyDemo(restoredOrigin, credentials, proof);
  assert.equal(await counts(target), before);
  await target.run(["restart", "api", "web", "gateway"]);
  await target.run(["up", "-d", "--wait", "--wait-timeout", "180"]);
  await verifyDemo(restoredOrigin, credentials, proof);
  writeFileSync(
    resolve(".artifacts", "demo-last-result.json"),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        sourceProject: source.project,
        restoredProject: target.project,
        backup,
        checks: [
          "empty database",
          "repeat seed",
          "store approval",
          "product and media",
          "checkout",
          "mock success/failure",
          "handover",
          "return",
          "cancellation/refund",
          "restart",
          "database and media restore",
          "restore refusal",
        ],
        proof,
      },
      null,
      2,
    ) + "\n",
  );
  completed = true;
  console.log(
    "Fresh Compose demo, full browser flow, seed, restart, and backup/restore passed.",
  );
} finally {
  let cleanupFailed = false;
  for (const ops of [target, source]) {
    if (!owned.has(ops)) continue;
    try {
      await ops.run(["down", "--volumes", "--remove-orphans"]);
    } catch {
      cleanupFailed = true;
      console.error(`Pembersihan project test ${ops.project} gagal.`);
    }
  }
  if (cleanupFailed) process.exitCode = 1;
  if (!completed)
    console.error(
      "Demo verification did not finish. Inspect the preceding failure.",
    );
}
