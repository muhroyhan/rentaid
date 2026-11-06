import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { demo } from "../../../scripts/demo.mjs";
import { stabilityProxy } from "./stability-proxy.mjs";
import { run } from "../../support/process.mjs";

for (const key of [
  "JAVA_HOME",
  "ANDROID_HOME",
  "ANDROID_SERIAL",
  "CHROME_PATH",
]) {
  if (!process.env[key]) throw new Error(`Set ${key}.`);
}
const suffix = randomBytes(6).toString("hex");
const name = `Stability-${suffix}`;
const email = `stability-${suffix}@example.test`;
const origin = "http://127.0.0.1:18083";
const mobileOrigin = "http://127.0.0.1:18084";
const env = {
  ...process.env,
  RENTAID_COMPOSE_PROJECT: `rentaid-stability-${suffix}`,
  RENTAID_HTTP_PORT: "18083",
  RENTAID_DB_PORT: "15432",
  SEED_ADMIN_EMAIL: "stability-admin@example.test",
  SEED_ADMIN_PASSWORD: randomBytes(18).toString("hex"),
  SEED_DEMO_PASSWORD: "Phase23-test-password!",
};
const ops = demo(env);
const artifacts = resolve(".artifacts", "stability-tests", suffix);
mkdirSync(artifacts, { recursive: true });
const adb = join(
  env.ANDROID_HOME,
  "platform-tools",
  process.platform === "win32" ? "adb.exe" : "adb",
);
const serial = env.ANDROID_SERIAL;
const runner = "id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner";
const appApk = resolve(
  "apps/android/app/build/outputs/apk/debug/app-debug.apk",
);
const testApk = resolve(
  "apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
);

async function command(
  binary,
  args,
  { cwd, capture = false, environment = env } = {},
) {
  return await run(binary, args, {
    cwd,
    env: environment,
    capture,
    timeoutMs: binary === adb && args[2] === "install" ? 180_000 : undefined,
  });
}
const device = (args, options) =>
  command(adb, ["-s", serial, ...args], options);
async function gradle(args) {
  return await command(
    process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew",
    args,
    { cwd: resolve("apps/android"), capture: true },
  );
}
async function instrument(stage) {
  await device(["shell", "am", "force-stop", "id.rentaid.app"], {
    capture: true,
  });
  const output = await device(
    [
      "shell",
      "am",
      "instrument",
      "-w",
      "-r",
      "-e",
      "stabilityStage",
      stage,
      "-e",
      "stabilityName",
      name,
      "-e",
      "stabilityEmail",
      email,
      "-e",
      "class",
      "id.rentaid.app.StabilityProcessTest#exerciseStage",
      runner,
    ],
    { capture: true },
  );
  writeFileSync(join(artifacts, `${stage}.log`), output);
  assert.match(
    output,
    /OK \(1 test\)/,
    `Android stage ${stage} failed: ${output}`,
  );
  console.log(`Android stage passed: ${stage}`);
}
async function sql(query) {
  return await ops.run(
    [
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
      "-At",
      "-c",
      query,
    ],
    { capture: true },
  );
}
async function proof() {
  return JSON.parse(
    await sql(
      `SELECT json_build_object('orders',(SELECT count(*) FROM orders WHERE user_id=u.id),'payments',(SELECT count(*) FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.user_id=u.id),'confirmedEvents',(SELECT count(*) FROM order_status_history h JOIN orders o ON o.id=h.order_id WHERE o.user_id=u.id AND h.to_status='confirmed'),'sessions',(SELECT count(*) FROM sessions WHERE user_id=u.id)) FROM users u WHERE email='${email}'`,
    ),
  );
}
async function restart() {
  console.log("Restarting isolated PostgreSQL and API.");
  await ops.run(["restart", "postgres"]);
  await ops.run(["up", "-d", "--wait", "--wait-timeout", "90", "postgres"]);
  await ops.run(["restart", "api"]);
  await ops.run(["up", "-d", "--wait", "--wait-timeout", "180"]);
}
async function available(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
let proxy, browser;
let owned = false,
  installed = false;
const checks = [];
try {
  assert.match(ops.project, /^rentaid-stability-[0-9a-f]{12}$/);
  await Promise.all([18083, 18084, 15432].map(available));
  assert.equal(
    await ops.run(["ps", "-a", "--services"], { capture: true }),
    "",
  );
  const devices = await command(adb, ["devices"], { capture: true });
  assert.ok(
    devices.includes(`${serial}\tdevice`),
    "Selected Android device is not ready.",
  );
  owned = true;
  console.log(
    "Building and starting an isolated shared web/admin/API/PostgreSQL stack.",
  );
  await ops.up();
  for (const fixture of ["phase20-fixtures.sql", "phase21-fixtures.sql"]) {
    await ops.run(
      [
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
      ],
      { input: resolve("tests/android", fixture) },
    );
  }
  proxy = await stabilityProxy(18084, origin);
  console.log("Building Android test APKs.");
  writeFileSync(
    join(artifacts, "android-build.log"),
    await gradle([
      "assembleDebug",
      "assembleDebugAndroidTest",
      `-PapiBaseUrl=${mobileOrigin}`,
    ]),
  );
  await device(["reverse", "tcp:18084", "tcp:18084"], { capture: true });
  await device(["install", "-r", appApk]);
  installed = true;
  await device(["install", "-r", testApk]);
  proxy.faults.dropPath = "/api/v1/checkout";
  await instrument("prepareCheckout");
  assert.ok(
    proxy.faults.dropped.some(
      (item) => item.path === "/api/v1/checkout" && item.status === 201,
    ),
  );
  assert.equal((await proof()).orders, 1);
  proxy.faults.dropPath = null;
  await restart();
  await instrument("recoverCheckout");
  assert.equal((await proof()).orders, 1);
  checks.push(
    "checkout response lost after commit; same key recovered after Android, API, and PostgreSQL restart",
  );
  const order = JSON.parse(
    await sql(
      `SELECT json_build_object('id',o.id,'code',o.order_code,'total',o.total,'productId',o.product_id,'start',o.start_date,'end',o.end_date) FROM orders o JOIN users u ON u.id=o.user_id WHERE u.email='${email}'`,
    ),
  );
  browser = await chromium.launch({
    executablePath: env.CHROME_PATH,
    headless: true,
  });
  const renter = await browser.newPage();
  await renter.goto(`${origin}/masuk`);
  await renter.getByLabel("Email", { exact: true }).fill(email);
  await renter.getByLabel("Kata sandi").fill("Phase24-test-password!");
  await renter.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await renter.waitForURL("**/akun");
  await renter.goto(`${origin}/pesanan/${order.id}`);
  await renter
    .getByRole("heading", { name: "Menunggu pembayaran", exact: true })
    .waitFor();
  const quoteUrl = `${origin}/api/v1/products/${order.productId}/quote?start_date=${order.start}&end_date=${order.end}&quantity=1`;
  assert.equal((await renter.request.get(quoteUrl)).status(), 409);
  proxy.faults.dropPath = "/api/v1/payment-simulator";
  await instrument("preparePayment");
  assert.ok(
    proxy.faults.dropped.some(
      (item) =>
        item.path === "/api/v1/payment-simulator" && item.status === 200,
    ),
  );
  assert.equal((await proof()).payments, 1);
  await renter.reload();
  await renter
    .getByRole("heading", { name: "Pesanan terkonfirmasi", exact: true })
    .waitFor();
  proxy.faults.dropPath = null;
  await restart();
  await instrument("recoverPayment");
  const after = await proof();
  assert.equal(after.orders, 1);
  assert.equal(after.payments, 1);
  assert.equal(after.confirmedEvents, 1);
  assert.equal((await renter.request.get(quoteUrl)).status(), 409);
  checks.push(
    "last stock remains reserved for browser and Android after checkout and payment restarts",
  );
  await renter.reload();
  await renter
    .getByRole("heading", { name: "Pesanan terkonfirmasi", exact: true })
    .waitFor();
  checks.push(
    "payment response lost after commit; one payment and one confirmed event persist across restarts; browser session survives",
  );
  for (const path of ["/api/v1/checkout", "/api/v1/payment-simulator"]) {
    const requests = proxy.faults.requests.filter((item) => item.path === path);
    assert.ok(requests.length >= 2);
    assert.equal(new Set(requests.map((item) => item.key)).size, 1);
    assert.equal(new Set(requests.map((item) => item.payloadHash)).size, 1);
  }
  proxy.faults.offline = true;
  await instrument("offline");
  proxy.faults.offline = false;
  await instrument("online");
  checks.push(
    "offline restoration preserves encrypted session and order; reconnect restores access",
  );
  const admin = await browser.newPage();
  await admin.goto(`${origin}/admin/`);
  await admin.getByLabel("Email", { exact: true }).fill(env.SEED_ADMIN_EMAIL);
  await admin.getByLabel("Kata sandi").fill(env.SEED_ADMIN_PASSWORD);
  await admin.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  const users = admin.getByRole("region", { name: "Pengguna", exact: true });
  await users
    .getByRole("button", { name: `${name} — Aktif`, exact: true })
    .click();
  await users
    .getByRole("button", { name: "Tangguhkan pengguna", exact: true })
    .click();
  await users.getByText("Status: Ditangguhkan", { exact: true }).waitFor();
  await instrument("revoked");
  await renter.reload();
  await renter
    .getByText("Silakan masuk untuk melihat pesanan.", { exact: false })
    .waitFor();
  assert.equal((await proof()).sessions, 0);
  checks.push(
    "admin browser suspension revokes Android and browser sessions; persisted order remains",
  );
  const regressionTests = [
    "CheckoutApiIntegrationTest",
    "PaymentApiIntegrationTest",
    "OrderCrossClientIntegrationTest#vendorWebHandoverAndReturnAreVisibleOnAndroidAndLateCancellationIsRejected",
    "OrderCrossClientIntegrationTest#androidCancellationAndRefundMatchWebAndOtherUserIsDenied",
    "OrderCrossClientIntegrationTest#webCancellationAndRefundAreVisibleOnAndroid",
    "OrderCrossClientIntegrationTest#pendingOrderCanBeCancelledWithoutRefund",
    "OrderUiIntegrationTest",
    "AccountResumeTest",
  ]
    .map((test) => `id.rentaid.app.${test}`)
    .join(",");
  const regression = await device(
    [
      "shell",
      "am",
      "instrument",
      "-w",
      "-r",
      "-e",
      "class",
      regressionTests,
      runner,
    ],
    { capture: true },
  );
  writeFileSync(join(artifacts, "regression.log"), regression);
  assert.match(regression, /OK \(\d+ tests?\)/, regression);
  checks.push(
    "cross web/Android last-stock race, checkout replay, payment outcomes, cancellation/refund, authorization, and Android order UI",
  );
  await command(process.execPath, ["tests/e2e/cross/test-android-vendor.mjs"], {
    environment: {
      ...env,
      E2E_WEB_URL: origin,
      E2E_VENDOR_PASSWORD: env.SEED_DEMO_PASSWORD,
    },
  });
  checks.push("real vendor browser handover and return observed by Android");
  writeFileSync(
    join(artifacts, "result.json"),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        project: ops.project,
        transactionCounts: await proof(),
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Stability checks passed. Report: ${join(artifacts, "result.json")}`,
  );
} finally {
  if (browser) await browser.close();
  if (installed) {
    console.log("Restoring the device APK to demo port 8081.");
    writeFileSync(
      join(artifacts, "demo-build.log"),
      await gradle(["assembleDebug", "-PapiBaseUrl=http://127.0.0.1:8081"]),
    );
    await device(["reverse", "tcp:8081", "tcp:8081"], { capture: true });
    await device(["install", "-r", appApk]);
    await device(["reverse", "--remove", "tcp:18084"], { capture: true });
  }
  if (proxy) await proxy.close();
  if (owned) await ops.run(["down", "--volumes", "--remove-orphans"]);
}
