import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
const origin = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000",
  adminOrigin = process.env.E2E_ADMIN_URL ?? "http://127.0.0.1:5173";
const executablePath = process.env.CHROME_PATH,
  adminEmail = process.env.E2E_ADMIN_EMAIL,
  adminPassword = process.env.E2E_ADMIN_PASSWORD,
  vendorPassword = process.env.E2E_VENDOR_PASSWORD;
if (!executablePath || !adminEmail || !adminPassword || !vendorPassword)
  throw new Error(
    "Set CHROME_PATH, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, and E2E_VENDOR_PASSWORD.",
  );
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const renter = await browser.newPage({
      viewport: { width: 390, height: 844 },
    }),
    vendor = await browser.newPage(),
    admin = await browser.newPage();
  const response = await renter.request.get(
      new URL("/api/v1/products", origin).href,
    ),
    products = await response.json(),
    product = products.find((p) => p.stock >= 2);
  if (!response.ok() || !product)
    throw new Error("Seed a public demo product with stock >= 2.");
  await renter.goto(new URL("/daftar", origin).href);
  await renter.getByLabel("Nama lengkap").fill("Penyewa Pengembalian");
  await renter
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await renter.getByLabel("Nomor telepon").fill("08123456789");
  await renter.getByLabel("Kata sandi").fill("Test-phase15-password!");
  await renter.getByRole("button", { name: /Buat akun/ }).click();
  await renter.waitForURL("**/akun");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const end = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 1);
  const after = date.toISOString().slice(0, 10);
  await renter.goto(new URL(`/produk/${product.id}`, origin).href);
  await renter.getByLabel("Tanggal mulai").fill(today);
  await renter.getByLabel("Tanggal selesai").fill(end);
  await renter.getByLabel("Jumlah barang").fill(String(product.stock));
  await renter.getByRole("button", { name: "Lihat penawaran" }).click();
  await renter.getByRole("heading", { name: "Ringkasan penawaran" }).waitFor();
  await renter.getByRole("button", { name: "Lanjut ke checkout" }).click();
  await renter.waitForURL("**/pesanan/*");
  await renter.getByRole("heading", { name: "Menunggu pembayaran" }).waitFor();
  const orderId = renter.url().split("/").at(-1);
  const code = (await renter.locator(".order-card .eyebrow").textContent())
    .replace("PESANAN ", "")
    .trim();
  await renter.getByRole("button", { name: "Simulasikan berhasil" }).click();
  await renter
    .getByRole("heading", { name: "Pesanan terkonfirmasi" })
    .waitFor();
  await vendor.goto(new URL("/masuk", origin).href);
  await vendor
    .getByLabel("Email", { exact: true })
    .fill("demo.approved@example.test");
  await vendor.getByLabel("Kata sandi").fill(vendorPassword);
  await vendor.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await vendor.waitForURL("**/akun");
  await vendor.goto(new URL("/vendor", origin).href);
  const row = vendor
    .getByRole("region", { name: "Pesanan masuk" })
    .locator("li")
    .filter({ hasText: code });
  await row.getByRole("button", { name: "Konfirmasi serah terima" }).click();
  await row.getByText("Status: Sedang disewa").waitFor();
  const responseWait = vendor.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/vendor/orders/${orderId}/return`) &&
      r.request().method() === "POST",
  );
  await row.getByRole("button", { name: "Konfirmasi pengembalian" }).click();
  const first = await responseWait;
  if (!first.ok()) throw new Error(`Return failed: ${first.status()}`);
  const firstBody = await first.json();
  await row.getByText("Status: Selesai").waitFor();
  await row.getByText(/Dikembalikan:/).waitFor();
  const session = await (
    await vendor.request.get(new URL("/api/v1/auth/session", origin).href)
  ).json();
  const replay = await vendor.request.post(
    new URL(`/api/v1/vendor/orders/${orderId}/return`, origin).href,
    { headers: { Origin: origin, "X-CSRF-Token": session.csrfToken } },
  );
  const replayBody = await replay.json();
  if (!replay.ok() || replayBody.returnedAt !== firstBody.returnedAt)
    throw new Error("Return replay changed the recorded time.");
  await renter.reload();
  await renter.getByRole("heading", { name: "Pesanan selesai" }).waitFor();
  await renter.getByText(/Dikembalikan:/).waitFor();
  const quote = (day) =>
    new URL(
      `/api/v1/products/${product.id}/quote?start_date=${day}&end_date=${day}&quantity=1`,
      origin,
    ).href;
  const last = await renter.request.get(quote(end));
  if (last.status() !== 409)
    throw new Error(`Stock was released on the last day: ${last.status()}.`);
  const next = await renter.request.get(quote(after));
  if (!next.ok())
    throw new Error(
      `Stock was not released after the last day: ${next.status()}.`,
    );
  await admin.goto(new URL("/admin/", adminOrigin).href);
  await admin.getByLabel("Email", { exact: true }).fill(adminEmail);
  await admin.getByLabel("Kata sandi").fill(adminPassword);
  await admin.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  const adminRow = admin
    .getByRole("region", { name: "Pesanan", exact: true })
    .locator("li")
    .filter({ hasText: code });
  await adminRow.getByText(/Status: Selesai/).waitFor();
  await adminRow.getByText(/Dikembalikan:/).waitFor();
  console.log(
    "Vendor return, idempotency, inclusive stock, and renter/admin completion passed.",
  );
} finally {
  await browser.close();
}
