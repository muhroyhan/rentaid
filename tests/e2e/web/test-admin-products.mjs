import { launchBrowser, submitLogin } from "../../support/browser.mjs";

const origin = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const executablePath = process.env.CHROME_PATH;
if (!email || !password || !executablePath)
  throw new Error("Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, and CHROME_PATH.");
const browser = await launchBrowser(executablePath);
try {
  const page = await browser.newPage();
  const api = (path) => new URL(path, origin).href;
  const catalog = await page.request.get(api("/api/v1/products"));
  const items = await catalog.json();
  const target = items.find((item) => item.name === "Kamera Mirrorless");
  if (!catalog.ok() || !target)
    throw new Error("Seeded product missing; use an isolated demo database.");
  await page.goto(api("/admin/"));
  await submitLogin(page, email, password);
  const products = page.getByRole("region", { name: "Produk", exact: true });
  await products.getByRole("button", { name: /Kamera Mirrorless/ }).click();
  await products
    .getByLabel("Alasan moderasi")
    .fill("Keterangan perlu diperiksa");
  await products.getByRole("button", { name: "Sembunyikan produk" }).click();
  await products.getByText(/Disembunyikan admin/).waitFor();
  let response = await page.request.get(api(`/api/v1/products/${target.id}`));
  if (response.status() !== 404)
    throw new Error("Hidden product remains public.");
  await products.getByLabel("Alasan moderasi").fill("Keterangan sudah sesuai");
  await products
    .getByRole("button", { name: "Aktifkan kembali produk" })
    .click();
  await products.getByText(/Tidak disembunyikan/).waitFor();
  await products.getByText(/Keterangan sudah sesuai/).waitFor();
  response = await page.request.get(api(`/api/v1/products/${target.id}`));
  if (!response.ok()) throw new Error("Restored product is not public.");
  console.log("Admin product moderation and public catalog visibility passed.");
} finally {
  await browser.close();
}
