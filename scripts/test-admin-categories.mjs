import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const origin = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const executablePath = process.env.CHROME_PATH;
if (!email || !password || !executablePath)
  throw new Error("Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, and CHROME_PATH.");
const name = `Kategori ${randomUUID()}`;
const renamed = `${name} baru`;
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(new URL("/admin/", origin).href);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  const section = page.getByRole("region", { name: "Kategori", exact: true });
  await section.getByLabel("Nama kategori").fill(name);
  await section.getByRole("button", { name: "Tambah kategori" }).click();
  await section.getByText("Kategori berhasil disimpan.").waitFor();
  await section.getByRole("button", { name: `Edit ${name}` }).click();
  await section.getByLabel("Nama kategori").fill(renamed);
  await section.getByRole("button", { name: "Simpan perubahan" }).click();
  await section.getByRole("button", { name: `Hapus ${renamed}` }).waitFor();
  const response = await page.request.get(
    new URL("/api/v1/categories", origin).href,
  );
  const categories = await response.json();
  if (!response.ok() || !categories.some((item) => item.name === renamed))
    throw new Error("Updated category not visible in public API.");
  page.once("dialog", (dialog) => dialog.accept());
  await section.getByRole("button", { name: `Hapus ${renamed}` }).click();
  await section.getByText("Kategori berhasil dihapus.").waitFor();
  if (await section.getByRole("button", { name: `Hapus ${renamed}` }).count())
    throw new Error("Deleted category remains in list.");
  console.log(
    "Category creation, rename, public reference, and deletion passed.",
  );
} finally {
  await browser.close();
}
