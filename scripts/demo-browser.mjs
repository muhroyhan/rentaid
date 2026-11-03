/* global document */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { chromium } from "playwright-core";

async function login(page, origin, email, password, admin = false) {
  await page.goto(new URL(admin ? "/admin/" : "/masuk", origin).href);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  if (admin)
    await page.getByRole("heading", { name: /Kelola halaman/ }).waitFor();
  else await page.waitForURL("**/akun");
}
async function register(page, origin, email, password, name) {
  await page.goto(new URL("/daftar", origin).href);
  await page.getByLabel("Nama lengkap").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Nomor telepon").fill("08123456789");
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await page.waitForURL("**/akun");
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function completeDemo(origin, credentials) {
  const browser = await chromium.launch({
    executablePath: credentials.chrome,
    headless: true,
  });
  try {
    const vendor = await browser.newPage(),
      renter = await browser.newPage({ viewport: { width: 390, height: 844 } }),
      admin = await browser.newPage();
    const suffix = randomUUID();
    const vendorEmail = `vendor-${suffix}@example.test`,
      renterEmail = `renter-${suffix}@example.test`,
      store = `Toko Demo ${suffix}`,
      name = `Produk Demo ${suffix}`;
    await register(
      vendor,
      origin,
      vendorEmail,
      credentials.password,
      "Vendor Demo",
    );
    await vendor.goto(new URL("/toko", origin).href);
    await vendor.getByLabel("Nama toko").fill(store);
    await vendor.getByLabel("Alamat toko").fill("Jakarta Selatan");
    await vendor.getByLabel("Nomor telepon toko").fill("08123456789");
    await vendor.getByRole("button", { name: "Kirim pengajuan toko" }).click();
    await vendor.getByText("Menunggu persetujuan").waitFor();
    await login(
      admin,
      origin,
      credentials.adminEmail,
      credentials.adminPassword,
      true,
    );
    const queue = admin.getByRole("region", { name: "Antrean toko" });
    await queue.getByRole("button", { name: `${store} — Menunggu` }).click();
    await queue.getByRole("button", { name: "Setujui", exact: true }).click();
    await queue.getByText("Status: Disetujui").waitFor();
    await vendor.goto(new URL("/vendor", origin).href);
    const list = vendor.getByRole("region", { name: "Daftar produk" });
    await list.getByRole("button", { name: /Tambah produk/ }).click();
    const form = vendor.getByRole("region", { name: "Produk baru" });
    await form.getByLabel("Nama produk").fill(name);
    await form.getByLabel("Deskripsi").fill("Produk untuk alur demo lokal.");
    const category = await form
      .locator('#product-category option:not([value=""])')
      .first()
      .getAttribute("value");
    assert.ok(category);
    await form.getByLabel("Kategori").selectOption(category);
    await form.getByLabel("Harga harian (Rp)").fill("100000");
    await form.getByLabel("Stok", { exact: true }).fill("3");
    const png = await vendor.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      canvas.getContext("2d").fillRect(0, 0, 2, 2);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await form.getByLabel(/Foto produk/).setInputFiles({
      name: "demo.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    await form
      .getByRole("status")
      .getByText("1 foto berhasil diunggah.")
      .waitFor();
    await form.getByRole("button", { name: /Simpan produk/ }).click();
    const productRow = list
      .getByRole("listitem")
      .filter({ has: vendor.getByRole("heading", { name, exact: true }) });
    await productRow
      .getByRole("button", { name: "Terbitkan", exact: true })
      .click();
    await productRow.getByText("Terbit", { exact: true }).waitFor();
    const own = await (
      await vendor.request.get(new URL("/api/v1/vendor/products", origin).href)
    ).json();
    const product = own.find((p) => p.name === name);
    assert.ok(product?.photoIds?.length === 1);
    const image = await vendor.request.get(
      new URL(`/api/v1/media/${product.photoIds[0]}`, origin).href,
    );
    assert.ok(image.ok());
    const imageHash = hash(await image.body());
    await register(
      renter,
      origin,
      renterEmail,
      credentials.password,
      "Penyewa Demo",
    );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    async function checkout(offset) {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      const day = date.toISOString().slice(0, 10);
      await renter.goto(new URL(`/produk/${product.id}`, origin).href);
      await renter.getByLabel("Tanggal mulai").fill(day);
      await renter.getByLabel("Tanggal selesai").fill(day);
      await renter.getByRole("button", { name: "Lihat penawaran" }).click();
      await renter
        .getByRole("heading", { name: "Ringkasan penawaran" })
        .waitFor();
      await renter.getByRole("button", { name: "Lanjut ke checkout" }).click();
      await renter.waitForURL("**/pesanan/*");
      await renter
        .getByRole("heading", { name: "Menunggu pembayaran" })
        .waitFor();
      return {
        id: renter.url().split("/").at(-1),
        code: (await renter.locator(".order-card .eyebrow").textContent())
          .replace("PESANAN ", "")
          .trim(),
      };
    }
    const completed = await checkout(0);
    await renter.getByRole("button", { name: "Simulasikan berhasil" }).click();
    await renter
      .getByRole("heading", { name: "Pesanan terkonfirmasi" })
      .waitFor();
    await vendor.reload();
    let orders = vendor.getByRole("region", { name: "Pesanan masuk" });
    let row = orders.locator("li").filter({ hasText: completed.code });
    await row.getByRole("button", { name: "Konfirmasi serah terima" }).click();
    await row.getByText("Status: Sedang disewa").waitFor();
    await row.getByRole("button", { name: "Konfirmasi pengembalian" }).click();
    await row.getByText("Status: Selesai").waitFor();
    await renter.reload();
    await renter.getByRole("heading", { name: "Pesanan selesai" }).waitFor();
    const failed = await checkout(2);
    await renter.getByRole("button", { name: "Simulasikan gagal" }).click();
    await renter.getByRole("heading", { name: "Pembayaran gagal" }).waitFor();
    const cancelled = await checkout(3);
    await renter.getByRole("button", { name: "Batalkan pesanan" }).click();
    await renter.getByRole("heading", { name: "Pesanan dibatalkan" }).waitFor();
    const refunded = await checkout(4);
    await renter.getByRole("button", { name: "Simulasikan berhasil" }).click();
    await renter
      .getByRole("heading", { name: "Pesanan terkonfirmasi" })
      .waitFor();
    await renter.getByRole("button", { name: "Batalkan pesanan" }).click();
    await renter.getByRole("heading", { name: "Pesanan dibatalkan" }).waitFor();
    await renter.getByText(/Refund simulasi berhasil/).waitFor();
    await admin.reload();
    const adminRow = admin
      .getByRole("region", { name: "Pesanan", exact: true })
      .locator("li")
      .filter({ hasText: completed.code });
    await adminRow.getByText(/Status: Selesai/).waitFor();
    await adminRow.getByRole("button", { name: "Lihat detail" }).click();
    await adminRow.getByRole("heading", { name: "Riwayat status" }).waitFor();
    return {
      vendorEmail,
      renterEmail,
      productId: product.id,
      photoId: product.photoIds[0],
      imageHash,
      productName: name,
      orders: {
        completed: completed.id,
        failed: failed.id,
        cancelled: cancelled.id,
        refunded: refunded.id,
      },
    };
  } finally {
    await browser.close();
  }
}
export async function verifyDemo(origin, credentials, proof) {
  const browser = await chromium.launch({
    executablePath: credentials.chrome,
    headless: true,
  });
  try {
    const renter = await browser.newPage();
    await login(renter, origin, proof.renterEmail, credentials.password);
    const expected = {
      completed: "completed",
      failed: "payment_failed",
      cancelled: "cancelled",
      refunded: "cancelled",
    };
    for (const [kind, id] of Object.entries(proof.orders)) {
      const response = await renter.request.get(
        new URL(`/api/v1/orders/${id}/detail`, origin).href,
      );
      assert.ok(response.ok(), `Missing restored order ${kind}`);
      const detail = await response.json();
      assert.equal(detail.order.status, expected[kind]);
      assert.equal(detail.order.total, 100000);
      assert.ok(detail.history.length >= 2);
      if (kind === "completed") {
        assert.ok(detail.order.returnedAt);
        assert.equal(detail.payment.status, "succeeded");
        assert.ok(detail.history.some((e) => e.toStatus === "completed"));
      }
      if (kind === "refunded") {
        assert.equal(detail.refund.amount, 100000);
        assert.equal(detail.payment.amount, 100000);
      }
      if (kind === "cancelled") assert.equal(detail.refund, undefined);
    }
    const product = await (
      await renter.request.get(
        new URL(`/api/v1/products/${proof.productId}`, origin).href,
      )
    ).json();
    assert.equal(product.name, proof.productName);
    const image = await renter.request.get(
      new URL(`/api/v1/media/${proof.photoId}`, origin).href,
    );
    assert.ok(image.ok());
    assert.equal(hash(await image.body()), proof.imageHash);
    await renter.goto(
      new URL(`/pesanan/${proof.orders.completed}`, origin).href,
    );
    await renter.getByRole("heading", { name: "Pesanan selesai" }).waitFor();
  } finally {
    await browser.close();
  }
}
