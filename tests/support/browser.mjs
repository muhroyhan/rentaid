import { chromium } from "playwright-core";

export function launchBrowser(executablePath) {
  return chromium.launch({ executablePath, headless: true });
}

export async function submitLogin(page, email, password) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
}
