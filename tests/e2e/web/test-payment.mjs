import { randomUUID } from "node:crypto";
import { launchBrowser, submitLogin } from "../../support/browser.mjs";
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
const browser = await launchBrowser(executablePath);
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
  await renter.getByLabel("Nama lengkap").fill("Penyewa Pembayaran");
  await renter
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await renter.getByLabel("Nomor telepon").fill("08123456789");
  await renter.getByLabel("Kata sandi").fill("Test-phase12-password!");
  await renter.getByRole("button", { name: /Buat akun/ }).click();
  await renter.waitForURL("**/akun");
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 100);
  const start = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 1);
  const end = day.toISOString().slice(0, 10);
  await renter.goto(new URL(`/produk/${product.id}`, origin).href);
  await renter.getByLabel("Tanggal mulai").fill(start);
  await renter.getByLabel("Tanggal selesai").fill(end);
  await renter.getByRole("button", { name: "Lihat penawaran" }).click();
  await renter.getByRole("heading", { name: "Ringkasan penawaran" }).waitFor();
  await renter.getByRole("button", { name: "Lanjut ke checkout" }).click();
  await renter.waitForURL("**/pesanan/*");
  await renter.getByRole("heading", { name: "Menunggu pembayaran" }).waitFor();
  await renter
    .getByText("Ini hanya simulasi lokal. Tidak ada uang yang dipindahkan.")
    .waitFor();
  const code = (await renter.locator(".order-card .eyebrow").textContent())
    .replace("PESANAN ", "")
    .trim();
  await renter.getByRole("button", { name: "Simulasikan berhasil" }).click();
  await renter
    .getByRole("heading", { name: "Pesanan terkonfirmasi" })
    .waitFor();
  await renter.reload();
  await renter
    .getByRole("heading", { name: "Pesanan terkonfirmasi" })
    .waitFor();
  await vendor.goto(new URL("/masuk", origin).href);
  await submitLogin(vendor, "demo.approved@example.test", vendorPassword);
  await vendor.waitForURL("**/akun");
  await vendor.goto(new URL("/vendor", origin).href);
  const vendorOrder = vendor
    .getByRole("region", { name: "Pesanan masuk" })
    .locator("li")
    .filter({ hasText: code });
  await vendorOrder.getByText(/Terkonfirmasi/).waitFor();
  await vendorOrder.getByText(/Penyewa Pembayaran/).waitFor();
  await admin.goto(new URL("/admin/", adminOrigin).href);
  await submitLogin(admin, adminEmail, adminPassword);
  const transactions = admin.getByRole("region", { name: "Transaksi" });
  await transactions.getByRole("button", { name: new RegExp(code) }).click();
  await transactions
    .getByRole("heading", { name: `Detail transaksi ${code}` })
    .waitFor();
  await transactions.getByText("Status: Berhasil").waitFor();
  const adminSession = await (
    await admin.request.get(new URL("/api/v1/auth/session", adminOrigin).href)
  ).json();
  const decisionUrl = new URL(
    `/api/v1/admin/stores/${product.storeId}/decision`,
    adminOrigin,
  ).href;
  const decisionHeaders = {
    Origin: adminOrigin,
    "X-CSRF-Token": adminSession.csrfToken,
  };
  const suspended = await admin.request.post(decisionUrl, {
    headers: decisionHeaders,
    data: { action: "suspend", reason: "Pengujian" },
  });
  if (!suspended.ok()) throw new Error("Store suspension failed.");
  let activated;
  try {
    await vendor.reload();
    await vendor
      .getByText(
        "Toko sedang ditangguhkan. Pesanan yang sudah ada tetap tersedia.",
      )
      .waitFor();
    await vendorOrder.getByText(/Terkonfirmasi/).waitFor();
  } finally {
    activated = await admin.request.post(decisionUrl, {
      headers: decisionHeaders,
      data: { action: "activate", reason: "Pengujian selesai" },
    });
  }
  if (!activated.ok()) throw new Error("Store reactivation failed.");
  console.log(
    "Simulated payment, order confirmation, vendor orders, and admin transaction detail passed.",
  );
} finally {
  await browser.close();
}
