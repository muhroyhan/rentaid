/* global document */
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

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
const suffix = randomUUID();
const group = `Cari${suffix}`;
const title = `Beranda terbit ${suffix}`;
const draft = `Rahasia draft ${suffix}`;
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const guest = await (await browser.newContext()).newPage();
  const vendor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const api = (path) => new URL(path, origin).href;
  const adminApi = (path) => new URL(path, adminOrigin).href;
  const png = await guest.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const beforeContent = await guest.request.get(api("/api/v1/content/home"));
  if (beforeContent.status() !== 200 && beforeContent.status() !== 404)
    throw new Error("Home content is unavailable.");
  const originalTitle = beforeContent.ok()
    ? (await beforeContent.json()).title
    : null;
  await guest.goto(api("/"));
  await guest
    .getByRole("heading", { name: originalTitle ?? /Ada banyak cara/ })
    .waitFor();
  await admin.goto(new URL("/admin/", adminOrigin).href);
  await admin.getByLabel("Email", { exact: true }).fill(adminEmail);
  await admin.getByLabel("Kata sandi").fill(adminPassword);
  await admin.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  const editor = admin.getByRole("region", { name: "Kelola halaman" });
  await editor.getByLabel("Judul", { exact: true }).fill(draft);
  await editor
    .getByLabel("Konten", { exact: true })
    .fill("Konten yang belum terbit.");
  await editor.getByRole("button", { name: "Simpan draft" }).click();
  await editor
    .getByRole("status")
    .getByText("Draft berhasil disimpan.")
    .waitFor();
  await guest.reload();
  if (await guest.getByText(draft).count())
    throw new Error("Unpublished home content leaked.");
  await guest
    .getByRole("heading", { name: originalTitle ?? /Ada banyak cara/ })
    .waitFor();
  await editor.getByLabel("Judul", { exact: true }).fill(title);
  await editor
    .getByLabel("Konten", { exact: true })
    .fill("Konten beranda dari admin.");
  await editor.getByLabel(/Gambar halaman/).setInputFiles({
    name: "home.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await editor
    .getByRole("status")
    .getByText(/Gambar diunggah/)
    .waitFor();
  await editor.getByRole("button", { name: "Publikasikan" }).click();
  await editor
    .getByRole("status")
    .getByText("Konten berhasil dipublikasikan.")
    .waitFor();
  await guest.reload();
  await guest.getByRole("heading", { name: title }).waitFor();
  await guest.getByText("Konten beranda dari admin.").waitFor();
  await guest.getByRole("img", { name: "Gambar beranda" }).waitFor();
  await guest.waitForFunction(() => {
    const image = document.querySelector('img[alt="Gambar beranda"]');
    return image?.complete && image.naturalWidth > 0;
  });
  await editor.getByLabel("Judul", { exact: true }).fill(draft);
  await editor.getByRole("button", { name: "Simpan draft" }).click();
  await editor
    .getByRole("status")
    .getByText("Draft berhasil disimpan.")
    .waitFor();
  await guest.reload();
  await guest.getByRole("heading", { name: title }).waitFor();
  if (await guest.getByText(draft).count())
    throw new Error("Updated draft leaked.");
  await vendor.goto(api("/masuk"));
  await vendor
    .getByLabel("Email", { exact: true })
    .fill("demo.approved@example.test");
  await vendor.getByLabel("Kata sandi").fill(vendorPassword);
  await vendor.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await vendor.waitForURL("**/akun");
  const session = await (
    await vendor.request.get(api("/api/v1/auth/session"))
  ).json();
  const headers = { Origin: origin, "X-CSRF-Token": session.csrfToken };
  const categoryResponse = await vendor.request.get(
    api("/api/v1/categories?page_size=50"),
  );
  const categories = await categoryResponse.json();
  if (!categoryResponse.ok() || categories.length < 2)
    throw new Error("Demo categories missing.");
  const imageResponse = await vendor.request.post(api("/api/v1/vendor/media"), {
    headers: { ...headers, "Content-Type": "application/octet-stream" },
    data: Buffer.from(png, "base64"),
  });
  if (imageResponse.status() !== 201)
    throw new Error("Product image upload failed.");
  const image = await imageResponse.json();
  async function create(index, categoryId, published, photoIds = []) {
    const name = `${group} Produk ${String(index).padStart(2, "0")}`;
    const response = await vendor.request.post(api("/api/v1/vendor/products"), {
      headers,
      data: {
        categoryId,
        name,
        description: `Barang untuk ${group}`,
        dailyPrice: 125000,
        stock: 2,
        photoIds,
      },
    });
    if (response.status() !== 201)
      throw new Error(`Product creation failed: ${response.status()}`);
    const product = await response.json();
    if (published) {
      const publish = await vendor.request.put(
        api(`/api/v1/vendor/products/${product.id}/publication`),
        { headers, data: { value: true } },
      );
      if (!publish.ok()) throw new Error("Publication failed.");
    }
    return product;
  }
  const created = [];
  for (let index = 0; index < 13; index++)
    created.push(
      await create(
        index,
        categories[index < 7 ? 0 : 1].id,
        true,
        index === 0 ? [image.id] : [],
      ),
    );
  const draftProduct = await create(13, categories[0].id, false);
  const hiddenProduct = await create(14, categories[0].id, true);
  const archivedProduct = await create(15, categories[0].id, true);
  const archive = await vendor.request.put(
    api(`/api/v1/vendor/products/${archivedProduct.id}/archive`),
    { headers, data: { value: true } },
  );
  if (!archive.ok()) throw new Error("Archive failed.");
  await guest.goto(api(`/katalog?q=${encodeURIComponent(hiddenProduct.name)}`));
  const staleLink = guest.getByRole("link", {
    name: new RegExp(hiddenProduct.name),
  });
  await staleLink.waitFor();
  const adminSession = await (
    await admin.request.get(adminApi("/api/v1/auth/session"))
  ).json();
  const hide = await admin.request.post(
    adminApi(`/api/v1/admin/products/${hiddenProduct.id}/moderation`),
    {
      headers: { Origin: adminOrigin, "X-CSRF-Token": adminSession.csrfToken },
      data: { hidden: true, reason: "Perlu diperiksa" },
    },
  );
  if (!hide.ok()) throw new Error("Moderation failed.");
  await staleLink.click();
  await guest
    .getByRole("heading", { name: "Produk belum tersedia." })
    .waitFor();
  if (await guest.getByRole("heading", { name: hiddenProduct.name }).count())
    throw new Error(
      "Previously listed product remained accessible after moderation.",
    );
  await guest.goto(api("/"));
  const featured = guest.getByRole("region", { name: "Pilihan produk" });
  const featuredLink = featured.locator(".catalog-card a").first();
  const featuredPath = await featuredLink.getAttribute("href");
  if (!featuredPath || !featuredPath.startsWith("/produk/"))
    throw new Error("Home product link missing.");
  await featuredLink.click();
  await guest.waitForURL("**/produk/**");
  await guest.getByText("LOKASI PENGAMBILAN").waitFor();
  await guest.goto(api("/katalog"));
  await guest.getByLabel("Cari produk").fill(group.toUpperCase());
  await guest.getByRole("button", { name: /Cari produk/ }).click();
  await guest.waitForURL(/q=/);
  if ((await guest.locator(".catalog-card").count()) !== 12)
    throw new Error("First search page is incorrect.");
  await guest.getByRole("link", { name: "Berikutnya →" }).click();
  await guest.waitForURL((url) => url.searchParams.get("page") === "2");
  await guest
    .getByRole("navigation", { name: "Halaman katalog" })
    .getByText("Halaman 2")
    .waitFor();
  if ((await guest.locator(".catalog-card").count()) !== 1)
    throw new Error("Second search page is incorrect.");
  await guest.getByRole("link", { name: "← Sebelumnya" }).click();
  await guest.waitForURL((url) => !url.searchParams.has("page"));
  await guest.getByLabel("Kategori").selectOption(categories[0].id);
  await guest.getByRole("button", { name: /Cari produk/ }).click();
  await guest.waitForURL(
    (url) => url.searchParams.get("category_id") === categories[0].id,
  );
  const filteredResponse = await guest.request.get(
    api(
      `/api/v1/products?q=${encodeURIComponent(group)}&category_id=${categories[0].id}&page_size=50`,
    ),
  );
  const filtered = await filteredResponse.json();
  const shown = await guest
    .locator(".catalog-card a")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")?.split("/").pop()).sort(),
    );
  if (
    !filteredResponse.ok() ||
    filtered.length !== 7 ||
    JSON.stringify(shown) !==
      JSON.stringify(filtered.map((item) => item.id).sort())
  )
    throw new Error("Category filter differs from API.");
  await guest
    .getByRole("link", { name: new RegExp(`${group} Produk 00`) })
    .click();
  await guest
    .getByRole("heading", { name: new RegExp(`${group} Produk 00`) })
    .waitFor();
  await guest
    .getByText("Toko Demo approved", { exact: true })
    .first()
    .waitFor();
  await guest.getByText("Jakarta", { exact: true }).waitFor();
  await guest
    .getByRole("img", { name: new RegExp(`Foto ${group} Produk 00`) })
    .waitFor();
  await guest.getByText(/125\.000/).waitFor();
  for (const item of [draftProduct, hiddenProduct, archivedProduct]) {
    await guest.goto(api(`/produk/${item.id}`));
    await guest
      .getByRole("heading", { name: "Produk belum tersedia." })
      .waitFor();
    if (await guest.getByRole("heading", { name: item.name }).count())
      throw new Error("Nonpublic product detail leaked.");
  }
  await guest.goto(api("/produk/not-a-uuid"));
  await guest
    .getByRole("heading", { name: "Produk belum tersedia." })
    .waitFor();
  const imageCheck = await guest.request.get(api(`/api/v1/media/${image.id}`));
  if (!imageCheck.ok() || imageCheck.headers()["content-type"] !== "image/png")
    throw new Error("Public product photo unavailable.");
  await guest.goto(api("/katalog?category_id=invalid"));
  await guest
    .getByText("Pencarian, kategori, atau nomor halaman tidak valid.")
    .waitFor();
  await guest.goto(
    api(`/katalog?q=${encodeURIComponent(`tidakada${suffix}`)}`),
  );
  await guest
    .getByText("Tidak ada produk yang cocok dengan pencarian Anda.")
    .waitFor();
  console.log(
    "CMS publication, public catalog search, category filtering, pagination, details, and nonpublic visibility passed.",
  );
} finally {
  await browser.close();
}
