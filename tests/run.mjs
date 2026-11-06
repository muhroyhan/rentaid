import { run, requireEnv, verifyAndroid } from "./support/process.mjs";

const [kind, ...options] = process.argv.slice(2);
const selected = options
  .find((option) => option.startsWith("--app="))
  ?.slice(6);
if (
  options.some((option) => !option.startsWith("--app=")) ||
  (selected && !["api", "web", "admin", "android"].includes(selected))
) {
  throw new Error(
    "Use --app=api|web|admin|android or omit it to run all applications.",
  );
}
const includes = (app) => !selected || selected === app;
const node = (file, ...args) => run(process.execPath, [file, ...args]);
const gradle = (...args) => node("scripts/android-gradle.mjs", ...args);

if (kind === "unit") {
  if (includes("android")) await verifyAndroid();
  if (!selected)
    await run(process.execPath, ["--test", "tests/unit/process.test.mjs"]);
  if (includes("api")) await node("tests/support/go.mjs", "unit");
  if (includes("web")) await node("tests/unit/web/catalog-errors.mjs");
  if (includes("admin"))
    console.log("Admin: no unit tests are currently defined.");
  if (includes("android")) {
    await gradle("testDebugUnitTest");
  }
} else if (kind === "integration") {
  if (includes("android")) await verifyAndroid();
  if (includes("api")) await node("tests/support/go.mjs", "integration");
  if (includes("web") || includes("admin"))
    console.log(
      "Web/admin integration is exercised through the API and browser suites; no separate integration tests are currently defined.",
    );
  if (includes("android")) await node("tests/integration/android.mjs");
} else if (kind === "e2e:web") {
  if (selected)
    throw new Error("Application filtering is not supported for E2E suites.");
  await node("tests/e2e/web/run.mjs");
} else if (kind === "e2e:android") {
  if (selected)
    throw new Error("Application filtering is not supported for E2E suites.");
  requireEnv([
    "JAVA_HOME",
    "ANDROID_HOME",
    "ANDROID_SERIAL",
    "ANDROID_EMULATOR_SERIAL",
    "CHROME_PATH",
  ]);
  await verifyAndroid({ devices: true });
  await node("tests/e2e/cross/test-stability.mjs");
  await node("scripts/build-android-demo.mjs");
  await node("tests/e2e/cross/test-android-delivery.mjs");
} else if (kind === "e2e") {
  if (selected)
    throw new Error("Application filtering is not supported for E2E suites.");
  requireEnv([
    "JAVA_HOME",
    "ANDROID_HOME",
    "ANDROID_SERIAL",
    "ANDROID_EMULATOR_SERIAL",
    "CHROME_PATH",
  ]);
  await verifyAndroid({ devices: true });
  await node("tests/run.mjs", "e2e:web");
  await node("tests/run.mjs", "e2e:android");
} else {
  throw new Error("Expected unit, integration, e2e:web, e2e:android, or e2e.");
}
