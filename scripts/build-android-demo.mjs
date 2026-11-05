import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

if (process.argv.length !== 2)
  throw new Error("Run pnpm android:demo without arguments.");
const output = resolve(".artifacts/android-demo");
const app = resolve("apps/android/app/build/outputs/apk/debug/app-debug.apk");
const targets = [
  { name: "usb", origin: "http://127.0.0.1:8081" },
  { name: "emulator", origin: "http://10.0.2.2:8081" },
];
mkdirSync(output, { recursive: true });
const artifacts = [];
for (const target of targets) {
  console.log(`Building Android demo APK for ${target.name}.`);
  const result = spawnSync(
    process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew",
    ["assembleDebug", `-PapiBaseUrl=${target.origin}`],
    {
      cwd: resolve("apps/android"),
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const filename = `rentaid-${target.name}-debug.apk`;
  const destination = join(output, filename);
  copyFileSync(app, destination);
  const sha256 = createHash("sha256")
    .update(readFileSync(destination))
    .digest("hex");
  artifacts.push({
    filename,
    apiOrigin: target.origin,
    sizeBytes: statSync(destination).size,
    sha256,
  });
  console.log(`${filename}: SHA-256 ${sha256}`);
}
writeFileSync(
  join(output, "manifest.json"),
  JSON.stringify(
    { builtAt: new Date().toISOString(), buildType: "debug", artifacts },
    null,
    2,
  ) + "\n",
);
