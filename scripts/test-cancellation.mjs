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
  await renter.getByLabel("Nama lengkap").fill("Penyewa Pembatalan");
  await renter
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await renter.getByLabel("Nomor telepon").fill("08123456789");
  await renter.getByLabel("Kata sandi").fill("Test-phase13-password!");
  await renter.getByRole("button", { name: /Buat akun/ }).click();
  await renter.waitForURL("**/akun");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  async function createOrder(offset, paid) {
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + offset);
    const date = day.toISOString().slice(0, 10);
    await renter.goto(new URL(`/produk/${product.id}`, origin).href);
    await renter.getByLabel("Tanggal mulai").fill(date);
    await renter.getByLabel("Tanggal selesai").fill(date);
    await renter.getByRole("button", { name: "Lihat penawaran" }).click();
    await renter
      .getByRole("heading", { name: "Ringkasan penawaran" })
      .waitFor();
    await renter.getByRole("button", { name: "Lanjut ke checkout" }).click();
    await renter.waitForURL("**/pesanan/*");
    await renter
      .getByRole("heading", { name: "Menunggu pembayaran" })
      .waitFor();
    const code = (await renter.locator(".order-card .eyebrow").textContent())
      .replace("PESANAN ", "")
      .trim();
    if (paid) {
      await renter
        .getByRole("button", { name: "Simulasikan berhasil" })
        .click();
      await renter
        .getByRole("heading", { name: "Pesanan terkonfirmasi" })
        .waitFor();
    }
    return code;
  }
  const renterCode = await createOrder(50, true);
  await renter.getByRole("button", { name: "Batalkan pesanan" }).click();
  await renter.getByRole("heading", { name: "Pesanan dibatalkan" }).waitFor();
  await renter.getByText(/Refund simulasi berhasil/).waitFor();
  await renter.reload();
  await renter.getByText(/Refund simulasi berhasil/).waitFor();
  const vendorCode = await createOrder(51, false);
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
    .filter({ hasText: vendorCode });
  await row.getByRole("button", { name: "Batalkan pesanan" }).click();
  await row.getByText("Status: Dibatalkan").waitFor();
  await renter.reload();
  await renter.getByRole("heading", { name: "Pesanan dibatalkan" }).waitFor();
  const adminCode = await createOrder(52, true);
  await admin.goto(new URL("/admin/", adminOrigin).href);
  await admin.getByLabel("Email", { exact: true }).fill(adminEmail);
  await admin.getByLabel("Kata sandi").fill(adminPassword);
  await admin.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  const adminRow = admin
    .getByRole("region", { name: "Pesanan", exact: true })
    .locator("li")
    .filter({ hasText: adminCode });
  await adminRow.getByRole("button", { name: "Batalkan pesanan" }).click();
  await adminRow.getByText(/Status: Dibatalkan/).waitFor();
  await adminRow.getByText(/Refund simulasi berhasil/).waitFor();
  await renter.reload();
  await renter.getByRole("heading", { name: "Pesanan dibatalkan" }).waitFor();
  await renter.getByText(/Refund simulasi berhasil/).waitFor();
  console.log(
    `Renter ${renterCode}, vendor ${vendorCode}, and admin ${adminCode} cancellation and refunds passed.`,
  );
} finally {
  await browser.close();
}
