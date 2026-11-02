import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const origin = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const adminOrigin = process.env.E2E_ADMIN_URL ?? "http://127.0.0.1:5173";
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const executablePath = process.env.CHROME_PATH;
if (!email || !password || !executablePath)
  throw new Error("Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, and CHROME_PATH.");
const suffix = randomUUID();
const store = `Toko ${suffix}`;
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const userContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const user = await userContext.newPage();
  const admin = await adminContext.newPage();
  await user.goto(new URL("/daftar", origin).href);
  await user.getByLabel("Nama lengkap").fill("Pengguna Pengujian");
  await user
    .getByLabel("Email", { exact: true })
    .fill(`${suffix}@example.test`);
  await user.getByLabel("Nomor telepon").fill("08123456789");
  await user.getByLabel("Kata sandi").fill("Test-password-phase07!");
  await user.getByRole("button", { name: /Buat akun/ }).click();
  await user.waitForURL("**/akun");
  await user.getByLabel("Nama lengkap").fill("Pengguna Diperbarui");
  await user.getByRole("button", { name: /Simpan profil/ }).click();
  await user.getByText("Profil berhasil disimpan.").waitFor();
  await user.goto(new URL("/vendor", origin).href);
  await user
    .getByText(/Dashboard tersedia setelah toko Anda disetujui/)
    .waitFor();
  if (
    (
      await user.request.get(new URL("/api/v1/vendor/dashboard", origin).href)
    ).status() !== 403
  )
    throw new Error("Unapproved vendor dashboard was accessible.");
  if (
    (
      await user.request.get(new URL("/api/v1/vendor/products", origin).href)
    ).status() !== 403
  )
    throw new Error("Unapproved vendor products were accessible.");
  await user.goto(new URL("/toko", origin).href);
  await user.getByLabel("Nama toko").fill(store);
  await user.getByLabel("Alamat toko").fill("Jakarta");
  await user.getByLabel("Nomor telepon toko").fill("08123456789");
  await user.getByRole("button", { name: "Kirim pengajuan toko" }).click();
  await user.getByText("Menunggu persetujuan").waitFor();
  await admin.goto(new URL("/admin/", adminOrigin).href);
  await admin.getByLabel("Email", { exact: true }).fill(email);
  await admin.getByLabel("Kata sandi").fill(password);
  await admin.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  const queue = admin.getByRole("region", { name: "Antrean toko" });
  await queue.getByRole("button", { name: `${store} — Menunggu` }).click();
  await queue.getByLabel(/Alasan/).fill("Lengkapi alamat toko");
  await queue.getByRole("button", { name: "Tolak", exact: true }).click();
  await queue.getByText("Status: Ditolak").waitFor();
  await user.reload();
  await user.getByText("Lengkapi alamat toko").waitFor();
  await user.getByRole("button", { name: /Perbaiki dan ajukan ulang/ }).click();
  await user.getByLabel("Alamat toko").fill("Jakarta Selatan");
  await user.getByRole("button", { name: "Kirim pengajuan ulang" }).click();
  await user.getByText("Menunggu persetujuan").waitFor();
  await admin.reload();
  await queue.getByRole("button", { name: `${store} — Menunggu` }).click();
  await queue.getByRole("button", { name: "Setujui", exact: true }).click();
  await queue.getByText("Status: Disetujui").waitFor();
  await user.goto(new URL("/vendor", origin).href);
  await user.getByText("Toko disetujui").waitFor();
  if (
    (
      await user.request.get(new URL("/api/v1/vendor/dashboard", origin).href)
    ).status() !== 200
  )
    throw new Error("Approved vendor dashboard was denied.");
  await user.reload();
  await user.getByRole("heading", { name: /Ruang untuk/ }).waitFor();
  await user.getByRole("button", { name: "Keluar" }).click();
  await user.getByRole("link", { name: "Masuk", exact: true }).waitFor();
  await user.goto(new URL("/akun", origin).href);
  await user.waitForURL("**/masuk");
  await user.getByLabel("Email", { exact: true }).fill(email);
  await user.getByLabel("Kata sandi").fill(password);
  await user.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await user
    .getByRole("alert")
    .getByText("Akun tidak dapat masuk melalui aplikasi ini.")
    .waitFor();
  console.log(
    "Marketplace registration, profile, application, rejection, resubmission, approval, SSR and logout passed.",
  );
} finally {
  await browser.close();
}
