/* global document */
import { randomUUID } from "node:crypto";
import { launchBrowser, submitLogin } from "../../support/browser.mjs";

const origin = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const adminOrigin = process.env.E2E_ADMIN_URL ?? "http://127.0.0.1:5173";
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const vendorPassword = process.env.E2E_VENDOR_PASSWORD;
const executablePath = process.env.CHROME_PATH;
if (!adminEmail || !adminPassword || !vendorPassword || !executablePath)
  throw new Error(
    "Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_VENDOR_PASSWORD, and CHROME_PATH.",
  );
const name = `Produk Uji ${randomUUID()}`;
const renamed = `${name} baru`;
const otherStore = `Toko lain ${randomUUID()}`;
const otherEmail = `${randomUUID()}@example.test`;
const browser = await launchBrowser(executablePath);
try {
  const vendorContext = await browser.newContext();
  const otherContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const vendor = await vendorContext.newPage();
  const other = await otherContext.newPage();
  const admin = await adminContext.newPage();
  async function login(page, email) {
    await page.goto(new URL("/masuk", origin).href);
    await submitLogin(page, email, vendorPassword);
    await page.waitForURL("**/akun");
  }
  await login(vendor, "demo.approved@example.test");
  await vendor.goto(new URL("/vendor", origin).href);
  const list = vendor.getByRole("region", { name: "Daftar produk" });
  await list.getByRole("button", { name: /Tambah produk/ }).click();
  const form = vendor.getByRole("region", { name: "Produk baru" });
  await vendor.waitForFunction(
    () => document.activeElement?.textContent === "Produk baru",
  );
  await form.getByLabel("Nama produk").fill(name);
  vendor.once("dialog", (dialog) => dialog.dismiss());
  await form.getByRole("button", { name: "Batal", exact: true }).click();
  if (!(await form.isVisible()))
    throw new Error(
      "Unsaved product form was closed after cancelling the confirmation.",
    );
  await form.getByLabel("Deskripsi").fill("Kamera untuk dokumentasi.");
  const category = await form
    .locator("#product-category option:not([value=''])")
    .first()
    .getAttribute("value");
  if (!category) throw new Error("Seed category missing.");
  await form.getByLabel("Kategori").selectOption(category);
  await form.getByLabel("Harga harian (Rp)").fill("0");
  await form.getByLabel("Stok", { exact: true }).fill("2");
  await form.getByRole("button", { name: /Simpan produk/ }).click();
  if (
    !(await form
      .getByLabel("Harga harian (Rp)")
      .evaluate((input) => input.validity.rangeUnderflow))
  )
    throw new Error("Invalid price was accepted.");
  await form.getByLabel("Harga harian (Rp)").fill("125000");
  await form.getByLabel("Stok", { exact: true }).fill("-1");
  await form.getByRole("button", { name: /Simpan produk/ }).click();
  if (
    !(await form
      .getByLabel("Stok", { exact: true })
      .evaluate((input) => input.validity.rangeUnderflow))
  )
    throw new Error("Invalid stock was accepted.");
  await form.getByLabel("Stok", { exact: true }).fill("2");
  await form.getByLabel(/Foto produk/).setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await form
    .getByRole("alert")
    .getByText("Konten atau gambar tidak valid.")
    .waitFor();
  const png = await vendor.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await form.getByLabel(/Foto produk/).setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await form
    .getByRole("status")
    .getByText("1 foto berhasil diunggah.")
    .waitFor();
  await form.getByRole("img", { name: "Foto produk 1" }).waitFor();
  await form.getByRole("button", { name: /Simpan produk/ }).click();
  await list.getByText(`Produk ${name} berhasil disimpan.`).waitFor();
  let row = list
    .getByRole("listitem")
    .filter({ has: vendor.getByRole("heading", { name, exact: true }) });
  await row.getByText("Draft", { exact: true }).waitFor();
  const own = await vendor.request.get(
    new URL("/api/v1/vendor/products", origin).href,
  );
  const created = (await own.json()).find((item) => item.name === name);
  if (!created || created.photoIds.length !== 1)
    throw new Error("Product or uploaded photo missing.");
  let publicResponse = await vendor.request.get(
    new URL(`/api/v1/products/${created.id}`, origin).href,
  );
  if (publicResponse.status() !== 404)
    throw new Error("Draft was publicly visible.");
  await row.getByRole("button", { name: "Terbitkan", exact: true }).click();
  await row.getByText("Terbit", { exact: true }).waitFor();
  publicResponse = await vendor.request.get(
    new URL("/api/v1/products", origin).href,
  );
  if (!(await publicResponse.json()).some((item) => item.id === created.id))
    throw new Error("Published product missing from catalog.");
  const photo = await vendor.request.get(
    new URL(`/api/v1/media/${created.photoIds[0]}`, origin).href,
  );
  if (!photo.ok() || photo.headers()["content-type"] !== "image/png")
    throw new Error("Public product photo unavailable.");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = vendor.getByRole("region", { name: "Edit produk" });
  await edit.getByLabel("Nama produk").fill(renamed);
  await edit.getByLabel("Harga harian (Rp)").fill("150000");
  await edit.getByLabel("Stok", { exact: true }).fill("3");
  await edit.getByRole("button", { name: /Simpan perubahan/ }).click();
  row = list.getByRole("listitem").filter({
    has: vendor.getByRole("heading", { name: renamed, exact: true }),
  });
  await row.getByText(/Stok 3/).waitFor();
  publicResponse = await vendor.request.get(
    new URL(`/api/v1/products/${created.id}`, origin).href,
  );
  const updated = await publicResponse.json();
  if (
    !publicResponse.ok() ||
    updated.name !== renamed ||
    updated.dailyPrice !== 150000 ||
    updated.photoIds[0] !== created.photoIds[0]
  )
    throw new Error("Updated public product is incorrect.");
  const sessionResponse = await vendor.request.get(
    new URL("/api/v1/auth/session", origin).href,
  );
  const session = await sessionResponse.json();
  const invalid = await vendor.request.put(
    new URL(`/api/v1/vendor/products/${created.id}`, origin).href,
    {
      headers: { Origin: origin, "X-CSRF-Token": session.csrfToken },
      data: {
        categoryId: category,
        name: renamed,
        description: "Kamera",
        dailyPrice: 0,
        stock: 3,
        photoIds: created.photoIds,
      },
    },
  );
  if (invalid.status() !== 400)
    throw new Error("Invalid API price was not rejected.");
  await other.goto(new URL("/daftar", origin).href);
  await other.getByLabel("Nama lengkap").fill("Vendor lain");
  await other.getByLabel("Email", { exact: true }).fill(otherEmail);
  await other.getByLabel("Kata sandi").fill(vendorPassword);
  await other.getByRole("button", { name: /Buat akun/ }).click();
  await other.waitForURL("**/akun");
  await other.goto(new URL("/toko", origin).href);
  await other.getByLabel("Nama toko").fill(otherStore);
  await other.getByLabel("Alamat toko").fill("Jakarta");
  await other.getByLabel("Nomor telepon toko").fill("08123456789");
  await other.getByRole("button", { name: "Kirim pengajuan toko" }).click();
  await other.getByText("Menunggu persetujuan").waitFor();
  await admin.goto(new URL("/admin/", adminOrigin).href);
  await submitLogin(admin, adminEmail, adminPassword);
  const queue = admin.getByRole("region", { name: "Antrean toko" });
  await queue.getByRole("button", { name: `${otherStore} — Menunggu` }).click();
  await queue.getByRole("button", { name: "Setujui", exact: true }).click();
  await queue.getByText("Status: Disetujui").waitFor();
  const otherSession = await (
    await other.request.get(new URL("/api/v1/auth/session", origin).href)
  ).json();
  const forbidden = await other.request.put(
    new URL(`/api/v1/vendor/products/${created.id}`, origin).href,
    {
      headers: { Origin: origin, "X-CSRF-Token": otherSession.csrfToken },
      data: {
        categoryId: category,
        name: "Milik orang lain",
        description: "Kamera",
        dailyPrice: 1000,
        stock: 1,
        photoIds: [],
      },
    },
  );
  if (forbidden.status() !== 404)
    throw new Error("Other vendor could change the product.");
  if (
    (
      await other.request.get(
        new URL(`/api/v1/vendor/media/${created.photoIds[0]}`, origin).href,
      )
    ).status() !== 404
  )
    throw new Error("Other vendor could access the photo.");
  const adminProducts = admin.getByRole("region", {
    name: "Produk",
    exact: true,
  });
  await adminProducts
    .getByRole("button", { name: new RegExp(renamed) })
    .click();
  await adminProducts.getByLabel("Alasan moderasi").fill("Perlu peninjauan");
  await adminProducts
    .getByRole("button", { name: "Sembunyikan produk" })
    .click();
  await adminProducts.getByText(/Disembunyikan admin/).waitFor();
  await vendor.reload();
  row = list.getByRole("listitem").filter({
    has: vendor.getByRole("heading", { name: renamed, exact: true }),
  });
  await row.getByText("Disembunyikan admin").waitFor();
  if (
    (
      await vendor.request.get(
        new URL(`/api/v1/products/${created.id}`, origin).href,
      )
    ).status() !== 404
  )
    throw new Error("Moderated product was public.");
  await adminProducts.getByLabel("Alasan moderasi").fill("Sudah sesuai");
  await adminProducts
    .getByRole("button", { name: "Aktifkan kembali produk" })
    .click();
  await adminProducts.getByText(/Tidak disembunyikan/).waitFor();
  await vendor.reload();
  row = list.getByRole("listitem").filter({
    has: vendor.getByRole("heading", { name: renamed, exact: true }),
  });
  await row.getByRole("button", { name: "Arsipkan" }).click();
  await row.getByText("Diarsipkan").waitFor();
  if (
    (
      await vendor.request.get(
        new URL(`/api/v1/products/${created.id}`, origin).href,
      )
    ).status() !== 404
  )
    throw new Error("Archived product was public.");
  await row.getByRole("button", { name: "Pulihkan" }).click();
  await row.getByText("Draft", { exact: true }).waitFor();
  await row.getByRole("button", { name: "Terbitkan" }).click();
  await row.getByText("Terbit", { exact: true }).waitFor();
  console.log(
    "Vendor product creation, photo validation, publication, editing, moderation, archive, and ownership passed.",
  );
} finally {
  await browser.close();
}
