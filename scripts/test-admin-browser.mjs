import { chromium } from "playwright-core";

const origin = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8081";
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const executablePath = process.env.CHROME_PATH;
if (!email || !password || !executablePath) {
  throw new Error("Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, and CHROME_PATH.");
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  const externalRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== new URL(origin).origin) {
      externalRequests.push(request.url());
    }
  });
  await page.goto(new URL("/admin/", origin).href);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi").fill("invalid-password");
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await page
    .getByRole("alert")
    .getByText("Email atau kata sandi tidak benar.")
    .waitFor();
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await page.getByText("Sesi aktif").waitFor();
  await page.getByText(email).waitFor();
  await page.reload();
  await page.getByText("Sesi aktif").waitFor();
  await page.getByRole("button", { name: /Keluar/ }).click();
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).waitFor();
  if (externalRequests.length) {
    throw new Error(
      "Unexpected external browser requests: " + externalRequests.join(", "),
    );
  }
  console.log("Admin login, session restore, and logout passed.");
} finally {
  await browser.close();
}
