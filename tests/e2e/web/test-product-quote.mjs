/* global document */
import { launchBrowser } from "../../support/browser.mjs";

const origin = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const executablePath = process.env.CHROME_PATH;
if (!executablePath) throw new Error("Set CHROME_PATH.");
const browser = await launchBrowser(executablePath);
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const response = await page.request.get(
    new URL("/api/v1/products", origin).href,
  );
  const products = await response.json();
  const product = products.find((item) => item.stock >= 2);
  if (!response.ok() || !product)
    throw new Error(
      "Seed a public product with stock >= 2 in an isolated database.",
    );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 2);
  const start = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 1);
  const end = day.toISOString().slice(0, 10);
  await page.goto(new URL(`/produk/${product.id}`, origin).href);
  await page.getByLabel("Tanggal mulai").fill(start);
  await page.getByLabel("Tanggal selesai").fill(end);
  await page.getByLabel("Jumlah barang").fill("2");
  await page.getByRole("button", { name: "Lihat penawaran" }).click();
  await page.getByRole("heading", { name: "Ringkasan penawaran" }).waitFor();
  await page.getByText(/2 hari × 2 barang/).waitFor();
  const total = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(product.dailyPrice * 4);
  await page.getByText(`Total ${total}`, { exact: true }).waitFor();
  await page.getByText("Penawaran ini belum menahan stok.").waitFor();
  await page.getByLabel("Tanggal selesai").fill(start);
  if (await page.getByRole("heading", { name: "Ringkasan penawaran" }).count())
    throw new Error("Stale quote remains visible after input changed.");
  await page.getByRole("button", { name: "Lihat penawaran" }).click();
  await page.getByText(/1 hari × 2 barang/).waitFor();
  await page.getByLabel("Tanggal selesai").fill("2000-01-01");
  await page.getByRole("button", { name: "Lihat penawaran" }).click();
  await page.getByRole("alert").waitFor();
  const dimensions = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  if (dimensions.page > dimensions.viewport)
    throw new Error("Mobile product detail overflows horizontally.");
  console.log(
    "Product quote form, inclusive totals, validation, and mobile layout passed.",
  );
} finally {
  await browser.close();
}
