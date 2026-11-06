import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function run(
  binary,
  args,
  { env = process.env, cwd, capture = false, timeoutMs } = {},
) {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env,
      shell: process.platform === "win32" && /\.(bat|cmd)$/i.test(binary),
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    let timedOut = false;
    const timer =
      timeoutMs &&
      setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
    if (capture) {
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
    }
    child.once("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(
          new Error(
            `${binary} timed out after ${timeoutMs} ms. Check the device installation prompt.`,
          ),
        );
        return;
      }
      if (code === 0) resolve(output);
      else
        reject(
          new Error(
            `${binary} failed with exit code ${code}.${capture ? `\n${output}` : ""}`,
          ),
        );
    });
  });
}

export async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(String(port))));
    });
  });
}

export function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length)
    throw new Error(
      `Set required environment variables: ${missing.join(", ")}.`,
    );
}

export async function verifyAndroid({ devices = false } = {}) {
  requireEnv(["JAVA_HOME", "ANDROID_HOME"]);
  const executable = (name) =>
    process.platform === "win32" ? `${name}.exe` : name;
  const java = join(process.env.JAVA_HOME, "bin", executable("java"));
  const sdk = process.env.ANDROID_HOME;
  if (!existsSync(java))
    throw new Error("JAVA_HOME must point to a JDK 17 installation.");
  const version = await run(java, ["-version"], { capture: true });
  if (!/version "17(?:[.+-]|")/.test(version))
    throw new Error("JDK 17 is required; update JAVA_HOME.");
  if (
    !existsSync(join(sdk, "platforms", "android-35", "android.jar")) ||
    !existsSync(join(sdk, "build-tools", "35.0.0"))
  ) {
    throw new Error(
      "Install Android SDK Platform 35 and Build Tools 35.0.0 in ANDROID_HOME.",
    );
  }
  if (devices) {
    requireEnv(["ANDROID_SERIAL", "ANDROID_EMULATOR_SERIAL"]);
    const adb = join(sdk, "platform-tools", executable("adb"));
    if (!existsSync(adb))
      throw new Error("Install Android SDK platform-tools in ANDROID_HOME.");
    const list = await run(adb, ["devices"], { capture: true });
    for (const key of ["ANDROID_SERIAL", "ANDROID_EMULATOR_SERIAL"]) {
      if (!list.includes(`${process.env[key]}\tdevice`))
        throw new Error(`${key} is not an available Android device.`);
    }
    if (process.env.ANDROID_SERIAL === process.env.ANDROID_EMULATOR_SERIAL)
      throw new Error("Use distinct USB and emulator serials.");
  }
}
