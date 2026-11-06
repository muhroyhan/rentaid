import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { demo } from "../../scripts/demo.mjs";
import { freePort, requireEnv, run } from "../support/process.mjs";

requireEnv(["JAVA_HOME", "ANDROID_HOME", "ANDROID_SERIAL"]);
const port = await freePort();
const env = {
  ...process.env,
  RENTAID_COMPOSE_PROJECT: `rentaid-integration-${randomBytes(6).toString("hex")}`,
  RENTAID_HTTP_PORT: port,
  RENTAID_DB_PORT: await freePort(),
  SEED_ADMIN_EMAIL: "integration-admin@example.test",
  SEED_ADMIN_PASSWORD: randomBytes(18).toString("hex"),
  SEED_DEMO_PASSWORD: "Phase23-test-password!",
};
const ops = demo(env, {
  extraComposeFiles: ["tests/integration/compose.yaml"],
});
const adb = join(
  process.env.ANDROID_HOME,
  "platform-tools",
  process.platform === "win32" ? "adb.exe" : "adb",
);
const device = (...args) =>
  run(adb, ["-s", process.env.ANDROID_SERIAL, ...args], {
    capture: true,
    timeoutMs: args[0] === "install" ? 180_000 : undefined,
  });
const runner = "id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner";
const instrument = async (test, args = []) => {
  console.log(`Android integration: ${test}`);
  const output = await device(
    "shell",
    "am",
    "instrument",
    "-w",
    "-r",
    ...args,
    "-e",
    "class",
    `id.rentaid.app.${test}`,
    runner,
  );
  if (
    !/OK \([1-9]\d* tests?\)/.test(output) ||
    /FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed/.test(output)
  ) {
    throw new Error(`Android test did not pass: ${test}\n${output}`);
  }
};
const classes = [
  "KeystoreSessionStoreTest",
  "CheckoutAttemptStoreTest",
  "PublicImageTest",
  "ConnectionScreenTest",
  "CatalogFailureUiTest",
  "LocalApiTest",
  "AccountResumeTest",
  "AccountApiIntegrationTest",
  "AccountUiIntegrationTest",
  "CatalogApiIntegrationTest",
  "CatalogUiIntegrationTest",
  "CheckoutApiIntegrationTest",
  "CheckoutUiIntegrationTest",
  "PaymentApiIntegrationTest",
  "OrderUiIntegrationTest",
  "OrderCrossClientIntegrationTest#vendorWebHandoverAndReturnAreVisibleOnAndroidAndLateCancellationIsRejected",
  "OrderCrossClientIntegrationTest#webCancellationAndRefundAreVisibleOnAndroid",
  "OrderCrossClientIntegrationTest#pendingOrderCanBeCancelledWithoutRefund",
  "OrderCrossClientIntegrationTest#androidCancellationAndRefundMatchWebAndOtherUserIsDenied",
];
let owned = false;
let reversed = false;
try {
  assert.match(ops.project, /^rentaid-integration-[0-9a-f]{12}$/);
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
  const devices = await run(adb, ["devices"], { capture: true });
  if (!devices.includes(`${process.env.ANDROID_SERIAL}\tdevice`))
    throw new Error("Selected Android device is not ready.");
  owned = true;
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
  await run(process.execPath, [
    "scripts/android-gradle.mjs",
    "assembleDebug",
    "assembleDebugAndroidTest",
    `-PapiBaseUrl=http://127.0.0.1:${port}`,
  ]);
  await device("reverse", `tcp:${port}`, `tcp:${port}`);
  reversed = true;
  await device(
    "install",
    "-r",
    resolve("apps/android/app/build/outputs/apk/debug/app-debug.apk"),
  );
  await device(
    "install",
    "-r",
    resolve(
      "apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
    ),
  );
  for (const test of classes) await instrument(test);
  for (const [test, phase] of [
    ["SessionProcessTest#prepareSession", "prepare"],
    ["SessionProcessTest#restoreSession", "restore"],
  ]) {
    await instrument(test, ["-e", "sessionPhase", phase]);
    if (phase === "prepare")
      await device("shell", "am", "force-stop", "id.rentaid.app");
  }
  await instrument("PaymentRecoveryProcessTest#prepareInterruptedPayment");
  await device("shell", "am", "force-stop", "id.rentaid.app");
  await instrument("PaymentRecoveryProcessTest#recoverInterruptedPayment");
} finally {
  try {
    if (reversed) await device("reverse", "--remove", `tcp:${port}`);
  } finally {
    if (owned) await ops.run(["down", "--volumes", "--remove-orphans"]);
  }
}
