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
  await renter.getByLabel("Nama lengkap").fill("Penyewa Serah Terima");
  await renter
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await renter.getByLabel("Nomor telepon").fill("08123456789");
  await renter.getByLabel("Kata sandi").fill("Test-phase14-password!");
  await renter.getByRole("button", { name: /Buat akun/ }).click();
  await renter.waitForURL("**/akun");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await renter.goto(new URL(`/produk/${product.id}`, origin).href);
  await renter.getByLabel("Tanggal mulai").fill(today);
  await renter.getByLabel("Tanggal selesai").fill(today);
  await renter.getByRole("button", { name: "Lihat penawaran" }).click();
  await renter.getByRole("heading", { name: "Ringkasan penawaran" }).waitFor();
  await renter.getByRole("button", { name: "Lanjut ke checkout" }).click();
  await renter.waitForURL("**/pesanan/*");
  await renter.getByRole("heading", { name: "Menunggu pembayaran" }).waitFor();
  const orderUrl = renter.url();
  const orderId = orderUrl.split("/").at(-1);
  const code = (await renter.locator(".order-card .eyebrow").textContent())
    .replace("PESANAN ", "")
    .trim();
  await renter.getByRole("button", { name: "Simulasikan berhasil" }).click();
  await renter
    .getByRole("heading", { name: "Pesanan terkonfirmasi" })
    .waitFor();
  const session = await (
    await renter.request.get(new URL("/api/v1/auth/session", origin).href)
  ).json();
  const unauthorized = await renter.request.post(
    new URL(`/api/v1/vendor/orders/${orderId}/handover`, origin).href,
    { headers: { Origin: origin, "X-CSRF-Token": session.csrfToken } },
  );
  if (unauthorized.status() !== 404)
    throw new Error(`Renter handover returned ${unauthorized.status()}.`);
  await vendor.goto(new URL("/masuk", origin).href);
  await submitLogin(vendor, "demo.approved@example.test", vendorPassword);
  await vendor.waitForURL("**/akun");
  await vendor.goto(new URL("/vendor", origin).href);
  const row = vendor
    .getByRole("region", { name: "Pesanan masuk" })
    .locator("li")
    .filter({ hasText: code });
  await row.getByText(/Penyewa Serah Terima/).waitFor();
  await row.getByText(/08123456789/).waitFor();
  await row.getByRole("button", { name: "Konfirmasi serah terima" }).click();
  await row.getByText("Status: Sedang disewa").waitFor();
  await renter.reload();
  await renter.getByRole("heading", { name: "Sedang disewa" }).waitFor();
  if (await renter.getByRole("button", { name: "Batalkan pesanan" }).count())
    throw new Error("Cancellation remained available after handover.");
  await admin.goto(new URL("/admin/", adminOrigin).href);
  await submitLogin(admin, adminEmail, adminPassword);
  const adminRow = admin
    .getByRole("region", { name: "Pesanan", exact: true })
    .locator("li")
    .filter({ hasText: code });
  await adminRow.getByText(/Status: Sedang disewa/).waitFor();
  console.log(
    "Vendor handover, renter and admin status, and access restrictions passed.",
  );
} finally {
  await browser.close();
}
