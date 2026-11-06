import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { demo } from "../../../scripts/demo.mjs";
import { run } from "../../support/process.mjs";

for (const key of [
  "JAVA_HOME",
  "ANDROID_HOME",
  "ANDROID_SERIAL",
  "ANDROID_EMULATOR_SERIAL",
  "CHROME_PATH",
]) {
  if (!process.env[key]) throw new Error(`Set ${key}.`);
}
const suffix = randomBytes(6).toString("hex");
const project = `rentaid-delivery-${suffix}`;
const origin = "http://127.0.0.1:8081";
const env = {
  ...process.env,
  RENTAID_COMPOSE_PROJECT: project,
  RENTAID_HTTP_PORT: "8081",
  RENTAID_DB_PORT: "15435",
  SEED_ADMIN_EMAIL: "delivery-admin@example.test",
  SEED_ADMIN_PASSWORD: randomBytes(18).toString("hex"),
  SEED_DEMO_PASSWORD: randomBytes(18).toString("hex"),
};
const ops = demo(env, {
  extraComposeFiles: ["infra/compose.offline-test.yaml"],
});
const artifactDir = resolve(".artifacts/android-demo");
const runDir = resolve(".artifacts/delivery-tests", suffix);
const manifest = JSON.parse(
  readFileSync(join(artifactDir, "manifest.json"), "utf8"),
);
const adb = join(
  env.ANDROID_HOME,
  "platform-tools",
  process.platform === "win32" ? "adb.exe" : "adb",
);
const java = join(
  env.JAVA_HOME,
  "bin",
  process.platform === "win32" ? "java.exe" : "java",
);
const signer = join(
  env.ANDROID_HOME,
  "build-tools",
  "35.0.0",
  "lib",
  "apksigner.jar",
);
const testApk = resolve(
  "apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
);
const runner = "id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner";
const targets = [
  {
    name: "usb",
    serial: env.ANDROID_SERIAL,
    apiOrigin: "http://127.0.0.1:8081",
  },
  {
    name: "emulator",
    serial: env.ANDROID_EMULATOR_SERIAL,
    apiOrigin: "http://10.0.2.2:8081",
  },
];
assert.notEqual(
  targets[0].serial,
  targets[1].serial,
  "Select two distinct devices.",
);
assert.doesNotMatch(
  targets[0].serial,
  /^emulator-\d+$/,
  "Select a physical Android device for USB.",
);
assert.match(
  targets[1].serial,
  /^emulator-\d+$/,
  "Select an Android emulator.",
);
mkdirSync(runDir, { recursive: true });

function start(binary, args, { cwd, capture = true } = {}) {
  const child = spawn(binary, args, {
    cwd,
    env,
    shell: process.platform === "win32" && binary.endsWith(".bat"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let done = false;
  const finished = new Promise((resolve, reject) => {
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        output += chunk.toString();
        if (!capture) process.stdout.write(chunk);
      });
    child.once("error", reject);
    child.once("close", (code) => {
      done = true;
      resolve(code);
    });
  });
  return {
    child,
    finished,
    get output() {
      return output;
    },
    get done() {
      return done;
    },
  };
}
const command = (binary, args, { cwd, timeoutMs } = {}) =>
  run(binary, args, { cwd, env, capture: true, timeoutMs });
const device = (serial, args) =>
  command(
    adb,
    ["-s", serial, ...args],
    args[0] === "install" ? { timeoutMs: 180_000 } : {},
  );
async function gradle(args) {
  return await command(
    process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew",
    args,
    { cwd: resolve("apps/android") },
  );
}
async function available(port) {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
async function gatewayRelay(container) {
  const connections = new Map();
  const server = createTcpServer((socket) => {
    const child = spawn(
      "docker",
      ["exec", "-i", container, "nc", "127.0.0.1", "80"],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    connections.set(socket, child);
    child.stderr.resume();
    child.once("error", () => socket.destroy());
    child.stdin.on("error", () => socket.destroy());
    child.stdout.on("error", () => socket.destroy());
    child.once("close", () => socket.destroy());
    socket.on("error", () => child.kill());
    socket.once("close", () => {
      connections.delete(socket);
      child.kill();
    });
    socket.pipe(child.stdin);
    child.stdout.pipe(socket);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8081, "127.0.0.1", resolve);
  });
  return {
    async close() {
      for (const [socket, child] of connections) {
        socket.destroy();
        child.kill();
      }
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
async function controlServer() {
  const events = new Map();
  const server = createHttpServer((request, response) => {
    if (
      request.method !== "POST" ||
      !events.has(request.headers["x-test-token"])
    ) {
      response.writeHead(403).end();
      return;
    }
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) request.destroy();
    });
    request.on("end", () => {
      try {
        const item = JSON.parse(body);
        if (typeof item.stage !== "string") throw new Error("Invalid stage");
        events.get(request.headers["x-test-token"]).set(item.stage, item);
        response.writeHead(200).end();
      } catch {
        response.writeHead(400).end();
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(18124, "127.0.0.1", resolve);
  });
  return {
    events,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
async function event(control, token, stage, instrument) {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const item = control.events.get(token).get(stage);
    if (item) return item;
    if (instrument.done)
      throw new Error(
        `Android test ended before ${stage}: ${instrument.output}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Timed out waiting for Android stage ${stage}: ${instrument.output}`,
  );
}
async function login(page, email, password, admin = false) {
  await page.goto(`${origin}${admin ? "/admin/" : "/masuk"}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  if (admin)
    await page.getByRole("heading", { name: /Kelola halaman/ }).waitFor();
  else await page.waitForURL("**/akun");
}

let owned = false;
let control, relay, browser, currentTest;
const results = [];
try {
  assert.match(project, /^rentaid-delivery-[0-9a-f]{12}$/);
  await Promise.all([8081, 15435, 18124].map(available));
  assert.equal(
    await ops.run(["ps", "-a", "--services"], { capture: true }),
    "",
  );
  assert.equal(
    (
      await command("docker", [
        "volume",
        "ls",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${project}`,
      ])
    ).trim(),
    "",
  );
  const devices = await command(adb, ["devices"]);
  let certificate;
  for (const target of targets) {
    assert.ok(
      devices.includes(`${target.serial}\tdevice`),
      `Device ${target.serial} is not ready.`,
    );
    const artifact = manifest.artifacts.find(
      (item) => item.apiOrigin === target.apiOrigin,
    );
    assert.ok(
      artifact && artifact.filename === `rentaid-${target.name}-debug.apk`,
    );
    target.apk = join(artifactDir, artifact.filename);
    assert.equal(
      createHash("sha256").update(readFileSync(target.apk)).digest("hex"),
      artifact.sha256,
    );
    const signed = await command(java, [
      "-jar",
      signer,
      "verify",
      "--verbose",
      "--print-certs",
      target.apk,
    ]);
    assert.match(
      signed,
      /Verified using v2 scheme \(APK Signature Scheme v2\): true/,
    );
    assert.match(signed, /CN=Android Debug/);
    const fingerprint = signed.match(
      /certificate SHA-256 digest: ([0-9a-f]+)/,
    )?.[1];
    assert.ok(fingerprint);
    if (certificate) assert.equal(fingerprint, certificate);
    certificate = fingerprint;
    target.sha256 = artifact.sha256;
  }
  owned = true;
  console.log(
    "Starting a fresh Compose demo on an internal-only runtime network.",
  );
  await ops.up();
  assert.equal(
    (
      await command("docker", [
        "network",
        "inspect",
        `${project}_default`,
        "--format",
        "{{.Internal}}",
      ])
    ).trim(),
    "true",
  );
  const gatewayId = await ops.run(["ps", "-q", "gateway"], { capture: true });
  assert.match(gatewayId, /^[0-9a-f]{12,64}$/);
  relay = await gatewayRelay(gatewayId);
  assert.equal((await fetch(`${origin}/api/v1/ready`)).status, 200);
  control = await controlServer();
  browser = await chromium.launch({
    executablePath: env.CHROME_PATH,
    headless: true,
  });
  const vendor = await browser.newPage();
  const admin = await browser.newPage();
  await login(vendor, "demo.approved@example.test", env.SEED_DEMO_PASSWORD);
  await login(admin, env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD, true);
  await vendor.goto(`${origin}/vendor`);
  for (const target of targets) {
    console.log(`Verifying delivered APK on ${target.name}: ${target.serial}.`);
    writeFileSync(
      join(runDir, `${target.name}-build.log`),
      await gradle([
        "assembleDebugAndroidTest",
        `-PapiBaseUrl=${target.apiOrigin}`,
      ]),
    );
    if (target.name === "usb")
      await device(target.serial, ["reverse", "tcp:8081", "tcp:8081"]);
    await device(target.serial, ["reverse", "tcp:18124", "tcp:18124"]);
    await device(target.serial, ["install", "-r", target.apk]);
    await device(target.serial, ["install", "-r", testApk]);
    const health = await device(target.serial, [
      "shell",
      "am",
      "instrument",
      "-w",
      "-r",
      "-e",
      "class",
      "id.rentaid.app.LocalApiTest",
      runner,
    ]);
    assert.match(health, /OK \(1 test\)/, health);
    const token = randomBytes(12).toString("hex");
    const name = `Delivery-${randomBytes(8).toString("hex")}`;
    control.events.set(token, new Map());
    currentTest = start(adb, [
      "-s",
      target.serial,
      "shell",
      "am",
      "instrument",
      "-w",
      "-r",
      "-e",
      "phase25",
      "true",
      "-e",
      "phase25Name",
      name,
      "-e",
      "phase25Control",
      "http://127.0.0.1:18124",
      "-e",
      "phase25Token",
      token,
      "-e",
      "class",
      "id.rentaid.app.DeliveryUiTest#renterCompletesDemoWithVendorAndAdmin",
      runner,
    ]);
    const ready = await event(control, token, "confirmed", currentTest);
    await vendor.reload();
    const region = vendor.getByRole("region", { name: "Pesanan masuk" });
    const row = region.locator("li").filter({ hasText: ready.code });
    await row.getByText("Status: Terkonfirmasi").waitFor();
    await row.getByRole("button", { name: "Konfirmasi serah terima" }).click();
    await row.getByText("Status: Sedang disewa").waitFor();
    await event(control, token, "renting", currentTest);
    await row.getByRole("button", { name: "Konfirmasi pengembalian" }).click();
    await row.getByText("Status: Selesai").waitFor();
    await event(control, token, "completed", currentTest);
    const finished = await event(control, token, "finished", currentTest);
    const code = await currentTest.finished;
    writeFileSync(
      join(runDir, `${target.name}-instrumentation.log`),
      currentTest.output,
    );
    assert.equal(code, 0);
    assert.match(currentTest.output, /OK \(1 test\)/, currentTest.output);
    currentTest = undefined;
    await admin.reload();
    const adminOrders = admin.getByRole("region", {
      name: "Pesanan",
      exact: true,
    });
    const adminRow = adminOrders.locator("li").filter({ hasText: ready.code });
    await adminRow.getByText(/Status: Selesai/).waitFor();
    const observed = {};
    for (const [label, expected] of [
      ["completed", "completed"],
      ["failed", "payment_failed"],
      ["unpaid", "cancelled"],
      ["refunded", "cancelled"],
    ]) {
      const response = await admin.request.get(
        `${origin}/api/v1/admin/orders/${finished[label]}`,
      );
      assert.ok(response.ok());
      const detail = await response.json();
      assert.equal(detail.order.status, expected);
      if (label === "completed") assert.ok(detail.order.returnedAt);
      if (label === "failed") assert.equal(detail.payment.status, "failed");
      if (label === "unpaid") {
        assert.ok(!detail.payment);
        assert.ok(!detail.refund);
      }
      if (label === "refunded")
        assert.equal(detail.refund.amount, detail.order.total);
      observed[label] = expected;
    }
    results.push({
      target: target.name,
      apiOrigin: target.apiOrigin,
      sha256: target.sha256,
      adminStatus: observed,
    });
    console.log(`Delivery flow passed for ${target.name}.`);
  }
  writeFileSync(
    join(runDir, "result.json"),
    JSON.stringify(
      { completedAt: new Date().toISOString(), internalNetwork: true, results },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Delivery verification passed. Report: ${join(runDir, "result.json")}`,
  );
} finally {
  currentTest?.child.kill();
  if (browser) await browser.close();
  if (control) await control.close();
  if (relay) await relay.close();
  for (const target of targets) {
    try {
      await device(target.serial, ["reverse", "--remove", "tcp:18124"]);
    } catch {
      /* Device may already be disconnected. */
    }
  }
  if (owned) await ops.run(["down", "--volumes", "--remove-orphans"]);
}
