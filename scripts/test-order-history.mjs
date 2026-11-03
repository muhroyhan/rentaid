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
    throw new Error("Seed a demo product with stock >= 2.");
  await renter.goto(new URL("/daftar", origin).href);
  await renter.getByLabel("Nama lengkap").fill("Penyewa Riwayat");
  await renter
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await renter.getByLabel("Nomor telepon").fill("08123456789");
  await renter.getByLabel("Kata sandi").fill("Test-phase16-password!");
  await renter.getByRole("button", { name: /Buat akun/ }).click();
  await renter.waitForURL("**/akun");
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 8);
  const start = day.toISOString().slice(0, 10);
  await renter.goto(new URL(`/produk/${product.id}`, origin).href);
  await renter.getByLabel("Tanggal mulai").fill(start);
  await renter.getByLabel("Tanggal selesai").fill(start);
  await renter.getByRole("button", { name: "Lihat penawaran" }).click();
  await renter.getByRole("heading", { name: "Ringkasan penawaran" }).waitFor();
  await renter.getByRole("button", { name: "Lanjut ke checkout" }).click();
  await renter.waitForURL("**/pesanan/*");
  await renter.getByRole("heading", { name: "Menunggu pembayaran" }).waitFor();
  const orderUrl = renter.url(),
    id = orderUrl.split("/").at(-1),
    code = (await renter.locator(".order-card .eyebrow").textContent())
      .replace("PESANAN ", "")
      .trim();
  await renter.getByRole("button", { name: "Simulasikan berhasil" }).click();
  await renter
    .getByRole("heading", { name: "Pesanan terkonfirmasi" })
    .waitFor();
  await renter.getByRole("button", { name: "Batalkan pesanan" }).click();
  await renter.getByRole("heading", { name: "Pesanan dibatalkan" }).waitFor();
  const history = renter.getByRole("region", { name: "Riwayat pesanan" });
  await history.getByText(/Pembayaran simulasi: Berhasil/).waitFor();
  await history.getByText(/Refund simulasi berhasil/).waitFor();
  await history.getByText(/Terkonfirmasi → Dibatalkan/).waitFor();
  await renter.goto(new URL("/pesanan", origin).href);
  await renter.getByLabel("Status pesanan").selectOption("cancelled");
  await renter.getByRole("link", { name: new RegExp(code) }).waitFor();
  await renter.getByLabel("Status pesanan").selectOption("confirmed");
  await renter.getByText("Belum ada pesanan pada halaman ini.").waitFor();
  await vendor.goto(new URL("/masuk", origin).href);
  await vendor
    .getByLabel("Email", { exact: true })
    .fill("demo.approved@example.test");
  await vendor.getByLabel("Kata sandi").fill(vendorPassword);
  await vendor.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await vendor.waitForURL("**/akun");
  await vendor.goto(new URL("/vendor", origin).href);
  await vendor.getByLabel("Status pesanan").selectOption("cancelled");
  const vendorRow = vendor
    .getByRole("region", { name: "Pesanan masuk" })
    .locator("li")
    .filter({ hasText: code });
  await vendorRow.getByRole("button", { name: "Lihat detail" }).click();
  await vendorRow.getByText(/Penyewa: Penyewa Riwayat/).waitFor();
  await vendorRow.getByRole("heading", { name: "Riwayat status" }).waitFor();
  await admin.goto(new URL("/admin/", adminOrigin).href);
  await admin.getByLabel("Email", { exact: true }).fill(adminEmail);
  await admin.getByLabel("Kata sandi").fill(adminPassword);
  await admin.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await admin.getByLabel("Status pesanan").selectOption("cancelled");
  const adminRow = admin
    .getByRole("region", { name: "Pesanan", exact: true })
    .locator("li")
    .filter({ hasText: code });
  await adminRow.getByRole("button", { name: "Lihat detail" }).click();
  await adminRow.getByText(/Penyewa: Penyewa Riwayat/).waitFor();
  await adminRow.getByRole("heading", { name: "Riwayat status" }).waitFor();
  if (await adminRow.getByRole("button", { name: "Batalkan pesanan" }).count())
    throw new Error("Cancellation shown for a final order.");
  const unauth = await renter.request.get(
    new URL(`/api/v1/admin/orders/${id}`, origin).href,
  );
  if (unauth.status() !== 403)
    throw new Error(`Admin order detail accessible: ${unauth.status()}.`);
  console.log(
    "Renter history, status filters, vendor and admin details, and permissions passed.",
  );
} finally {
  await browser.close();
}
