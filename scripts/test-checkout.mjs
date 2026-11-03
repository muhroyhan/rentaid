/* global document */
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
const origin = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const executablePath = process.env.CHROME_PATH;
if (!executablePath) throw new Error("Set CHROME_PATH.");
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const response = await page.request.get(
    new URL("/api/v1/products", origin).href,
  );
  const products = await response.json();
  const product = products.find((p) => p.stock >= 2);
  if (!response.ok() || !product)
    throw new Error(
      "Seed a public product with stock >= 2 in an isolated database.",
    );
  await page.goto(new URL("/daftar", origin).href);
  await page.getByLabel("Nama lengkap").fill("Penyewa Uji");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await page.getByLabel("Nomor telepon").fill("08123456789");
  await page.getByLabel("Kata sandi").fill("Test-phase11-password!");
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await page.waitForURL("**/akun");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 8);
  const start = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 1);
  const end = day.toISOString().slice(0, 10);
  await page.goto(new URL(`/produk/${product.id}`, origin).href);
  await page.getByLabel("Tanggal mulai").fill(start);
  await page.getByLabel("Tanggal selesai").fill(end);
  await page.getByRole("button", { name: "Lihat penawaran" }).click();
  await page.getByRole("heading", { name: "Ringkasan penawaran" }).waitFor();
  await page.getByRole("button", { name: "Lanjut ke checkout" }).click();
  await page.waitForURL("**/pesanan/*");
  await page.getByRole("heading", { name: "Menunggu pembayaran" }).waitFor();
  await page.getByText(/Stok ditahan sampai/).waitFor();
  await page.getByRole("heading", { name: product.name }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Menunggu pembayaran" }).waitFor();
  const dimensions = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  if (dimensions.page > dimensions.viewport)
    throw new Error("Mobile checkout page overflows horizontally.");
  console.log("Checkout, stock hold, order reload, and mobile layout passed.");
} finally {
  await browser.close();
}
