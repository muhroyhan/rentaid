import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium } from "playwright-core";

const origin = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const password = process.env.E2E_VENDOR_PASSWORD;
const executablePath = process.env.CHROME_PATH;
const serial = process.env.ANDROID_SERIAL;
if (!password || !executablePath || !serial || !process.env.ANDROID_HOME) {
  throw new Error(
    "Set E2E_VENDOR_PASSWORD, CHROME_PATH, ANDROID_SERIAL, and ANDROID_HOME.",
  );
}
const adb = join(
  process.env.ANDROID_HOME,
  "platform-tools",
  process.platform === "win32" ? "adb.exe" : "adb",
);
const browser = await chromium.launch({ executablePath, headless: true });
const renterName = `Android-${randomUUID()}`;
let test;
try {
  const page = await browser.newPage();
  await page.goto(new URL("/masuk", origin).href);
  await page
    .getByLabel("Email", { exact: true })
    .fill("demo.approved@example.test");
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await page.waitForURL("**/akun");
  await page.goto(new URL("/vendor", origin).href);
  test = spawn(adb, [
    "-s",
    serial,
    "shell",
    "am",
    "instrument",
    "-w",
    "-r",
    "-e",
    "phase23Browser",
    "true",
    "-e",
    "phase23Name",
    renterName,
    "-e",
    "class",
    "id.rentaid.app.OrderCrossClientIntegrationTest#androidTracksVendorBrowserActions",
    "id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner",
  ]);
  let output = "";
  test.stdout.on("data", (data) => {
    output += data.toString();
  });
  test.stderr.on("data", (data) => {
    output += data.toString();
  });
  const finished = new Promise((resolve, reject) => {
    test.on("error", reject);
    test.on("close", (code) => resolve(code));
  });
  const region = page.getByRole("region", { name: "Pesanan masuk" });
  const row = region
    .locator("li")
    .filter({ hasText: renterName })
    .filter({ hasText: "Status: Terkonfirmasi" });
  let found = false;
  for (let i = 0; i < 40; i++) {
    await page.reload();
    await region.waitFor();
    await region.getByText("Memuat pesanan...").waitFor({ state: "hidden" });
    if (
      await row.waitFor({ timeout: 1500 }).then(
        () => true,
        () => false,
      )
    ) {
      found = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  if (!found)
    throw new Error(
      `Android test order did not appear on vendor page: ${output}`,
    );
  await row.getByRole("button", { name: "Konfirmasi serah terima" }).click();
  const active = region
    .locator("li")
    .filter({ hasText: renterName })
    .filter({ hasText: "Status: Sedang disewa" });
  await active.waitFor();
  await page.waitForTimeout(2000);
  await active.getByRole("button", { name: "Konfirmasi pengembalian" }).click();
  await region
    .locator("li")
    .filter({ hasText: renterName })
    .filter({ hasText: "Status: Selesai" })
    .waitFor();
  const code = await finished;
  if (code !== 0 || !output.includes("OK (1 test)"))
    throw new Error(`Android verification failed: ${output}`);
  console.log("Android observed vendor browser handover and return.");
} finally {
  test?.kill();
  await browser.close();
}
