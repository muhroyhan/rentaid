/* global document */
import { chromium } from "playwright-core";

const origin = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const executablePath = process.env.CHROME_PATH;
if (!email || !password || !executablePath) {
  throw new Error("Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, and CHROME_PATH.");
}
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(new URL("/admin/", origin).href);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Masuk ke Rentaid/ }).click();
  await page.getByRole("heading", { name: /Kelola halaman/ }).waitFor();
  await page.getByRole("button", { name: /FAQ/ }).click();
  const title = page.getByLabel("Judul", { exact: true });
  await title.waitFor();
  const initial = await page.request.get(
    new URL("/api/v1/admin/content/faq", origin).href,
  );
  const original = await initial.json();
  if (!initial.ok() || original.title || original.body || original.published) {
    throw new Error("FAQ is not empty. Use a fresh isolated test database.");
  }
  await title.fill("Pertanyaan pengujian");
  await page
    .getByLabel("Konten", { exact: true })
    .fill("Jawaban yang sudah terbit.");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel(/Gambar halaman/).setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page
    .getByRole("status")
    .getByText(/Gambar diunggah/)
    .waitFor();
  await page.getByRole("button", { name: "Simpan draft" }).click();
  await page
    .getByRole("status")
    .getByText("Draft berhasil disimpan.")
    .waitFor();
  const unpublished = await page.request.get(
    new URL("/api/v1/content/faq", origin).href,
  );
  if (unpublished.status() !== 404)
    throw new Error("Draft was exposed publicly.");
  await page.getByRole("button", { name: "Publikasikan" }).click();
  await page
    .getByRole("status")
    .getByText("Konten berhasil dipublikasikan.")
    .waitFor();
  const published = await page.request.get(
    new URL("/api/v1/content/faq", origin).href,
  );
  const content = await published.json();
  if (
    !published.ok() ||
    content.body !== "Jawaban yang sudah terbit." ||
    !content.imageId
  ) {
    throw new Error("Published content is incorrect.");
  }
  const media = await page.request.get(
    new URL("/api/v1/media/" + content.imageId, origin).href,
  );
  if (!media.ok() || media.headers()["content-type"] !== "image/png") {
    throw new Error("Published image is unavailable.");
  }
  await page
    .getByLabel("Konten", { exact: true })
    .fill("Perubahan draft rahasia.");
  await page.getByRole("button", { name: "Simpan draft" }).click();
  await page
    .getByRole("status")
    .getByText("Draft berhasil disimpan.")
    .waitFor();
  const stillPublic = await page.request.get(
    new URL("/api/v1/content/faq", origin).href,
  );
  if ((await stillPublic.json()).body !== "Jawaban yang sudah terbit.") {
    throw new Error("Unpublished changes leaked.");
  }
  await page.reload();
  await page.getByRole("button", { name: /FAQ/ }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#content-body")?.value ===
      "Perubahan draft rahasia.",
  );
  if (
    (await page.getByLabel("Konten", { exact: true }).inputValue()) !==
    "Perubahan draft rahasia."
  ) {
    throw new Error("Saved draft was not restored.");
  }
  console.log(
    "Admin content draft, image upload, publication, and draft isolation passed.",
  );
} finally {
  await browser.close();
}
