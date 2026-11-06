import { randomUUID } from "node:crypto";
import { launchBrowser, submitLogin } from "../../support/browser.mjs";

const origin = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const executablePath = process.env.CHROME_PATH;
if (!email || !password || !executablePath)
  throw new Error("Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, and CHROME_PATH.");
const fixture = `phase04-${randomUUID()}`;
const browser = await launchBrowser(executablePath);
try {
  const page = await browser.newPage();
  const api = (path) => new URL(path, origin).href;
  const user = {
    email: `${fixture}@example.test`,
    password: "Test-password-phase04!",
    name: fixture,
    phone: "08123456789",
    client: "android",
  };
  let response = await page.request.post(api("/api/v1/auth/register"), {
    data: user,
  });
  if (response.status() !== 201)
    throw new Error(`Registration: ${response.status()}`);
  response = await page.request.post(api("/api/v1/auth/login"), {
    data: { email: user.email, password: user.password, client: "android" },
  });
  if (!response.ok()) throw new Error(`Login: ${response.status()}`);
  const token = (await response.json()).token;
  const headers = { Authorization: `Bearer ${token}` };
  const storeInput = {
    name: fixture,
    address: "Jakarta",
    phone: "08123456789",
  };
  response = await page.request.post(api("/api/v1/store"), {
    data: storeInput,
    headers,
  });
  if (response.status() !== 201) throw new Error(`Store: ${response.status()}`);

  await page.goto(api("/admin/"));
  await submitLogin(page, email, password);
  const queue = page.getByRole("region", { name: "Antrean toko" });
  await queue.getByRole("button", { name: `${fixture} — Menunggu` }).click();
  await queue.getByLabel(/Alasan/).fill("Alamat perlu dilengkapi");
  await queue.getByRole("button", { name: "Tolak", exact: true }).click();
  await queue.getByText("Status: Ditolak").waitFor();
  await queue.getByText(/Alamat perlu dilengkapi/).waitFor();
  response = await page.request.put(api("/api/v1/store"), {
    data: { ...storeInput, address: "Jakarta Selatan" },
    headers,
  });
  if (!response.ok()) throw new Error(`Resubmit: ${response.status()}`);
  await page.reload();
  await queue.getByRole("button", { name: `${fixture} — Menunggu` }).click();
  await queue.getByRole("button", { name: "Setujui", exact: true }).click();
  await queue.getByText("Status: Disetujui").waitFor();
  await queue.getByLabel(/Alasan/).fill("Pemeriksaan demo");
  await queue.getByRole("button", { name: "Tangguhkan toko" }).click();
  await queue.getByText("Status: Ditangguhkan").waitFor();
  await queue.getByRole("button", { name: "Aktifkan toko" }).click();
  await queue.getByText("Status: Disetujui").waitFor();
  const users = page.getByRole("region", { name: "Pengguna" });
  await users.getByRole("button", { name: `${fixture} — Aktif` }).click();
  await users.getByRole("button", { name: "Tangguhkan pengguna" }).click();
  await users.getByText("Status: Ditangguhkan").waitFor();
  response = await page.request.get(api("/api/v1/profile"), { headers });
  if (response.status() !== 401)
    throw new Error("Suspended user session remains valid.");
  await users.getByRole("button", { name: "Aktifkan pengguna" }).click();
  await users.getByText("Status: Aktif").waitFor();
  console.log(
    "Store decisions, resubmission, user suspension, and session revocation passed.",
  );
} finally {
  await browser.close();
}
