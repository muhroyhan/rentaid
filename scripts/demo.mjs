import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  openSync,
  closeSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));

export function demo(env = process.env, { extraComposeFiles = [] } = {}) {
  const project = env.RENTAID_COMPOSE_PROJECT ?? "rentaid";
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project))
    throw new Error("Nama project Compose tidak valid.");
  for (const key of ["RENTAID_DB_PORT", "RENTAID_HTTP_PORT"]) {
    if (
      env[key] &&
      (!/^\d+$/.test(env[key]) ||
        Number(env[key]) < 1 ||
        Number(env[key]) > 65535)
    )
      throw new Error(`Port ${key} tidak valid.`);
  }
  const prefix = [
    "compose",
    "-f",
    join(root, "infra/compose.yaml"),
    ...extraComposeFiles.flatMap((file) => ["-f", resolve(file)]),
    "-p",
    project,
    "--profile",
    "app",
  ];
  async function run(args, { capture = false, input, output } = {}) {
    let inputFd, outputFd;
    try {
      if (input) inputFd = openSync(input, "r");
      if (output) outputFd = openSync(output, "wx", 0o600);
      return await new Promise((success, failure) => {
        const child = spawn("docker", [...prefix, ...args], {
          cwd: root,
          env,
          stdio: [
            inputFd ?? "ignore",
            outputFd ?? (capture ? "pipe" : "inherit"),
            "inherit",
          ],
        });
        let result = "";
        if (capture)
          child.stdout.on("data", (chunk) => {
            result += chunk.toString();
          });
        child.once("error", failure);
        child.once("close", (code) =>
          code === 0
            ? success(result.trim())
            : failure(
                new Error(`Docker Compose gagal (${args[0]}, kode ${code}).`),
              ),
        );
      });
    } finally {
      if (inputFd !== undefined) closeSync(inputFd);
      if (outputFd !== undefined) closeSync(outputFd);
    }
  }
  const running = async () =>
    new Set(
      (
        await run(["ps", "--status", "running", "--services"], {
          capture: true,
        })
      )
        .split(/\r?\n/)
        .filter(Boolean),
    );
  const seed = async () => {
    for (const key of [
      "SEED_ADMIN_EMAIL",
      "SEED_ADMIN_PASSWORD",
      "SEED_DEMO_PASSWORD",
    ]) {
      if (!env[key]) throw new Error(`Tetapkan ${key} melalui environment.`);
    }
    if (
      env.SEED_ADMIN_PASSWORD.length < 12 ||
      env.SEED_DEMO_PASSWORD.length < 12
    )
      throw new Error("Password seed minimal 12 karakter.");
    await run([
      "exec",
      "-T",
      "-e",
      "SEED_ADMIN_EMAIL",
      "-e",
      "SEED_ADMIN_PASSWORD",
      "-e",
      "SEED_DEMO_PASSWORD",
      "api",
      "/app/rentaid",
      "seed",
    ]);
  };
  const hash = (path) =>
    createHash("sha256").update(readFileSync(path)).digest("hex");
  return {
    project,
    run,
    seed,
    async up() {
      for (const key of [
        "SEED_ADMIN_EMAIL",
        "SEED_ADMIN_PASSWORD",
        "SEED_DEMO_PASSWORD",
      ]) {
        if (!env[key]) throw new Error(`Tetapkan ${key} melalui environment.`);
      }
      await run(["up", "-d", "--build", "--wait", "--wait-timeout", "180"]);
      await seed();
    },
    async down() {
      await run(["down"]);
    },
    async backup(directory) {
      const path = resolve(directory);
      if (existsSync(path)) throw new Error("Direktori backup harus baru.");
      const services = await running();
      if (!services.has("postgres") || !services.has("api"))
        throw new Error("PostgreSQL dan API harus berjalan sebelum backup.");
      mkdirSync(path, { recursive: true, mode: 0o700 });
      await run(["stop", "api"]);
      try {
        await run(
          [
            "exec",
            "-T",
            "postgres",
            "pg_dump",
            "-U",
            "rentaid",
            "-d",
            "rentaid",
            "-Fc",
            "--no-owner",
            "--no-acl",
          ],
          { output: join(path, "database.dump") },
        );
        await run(
          [
            "run",
            "--rm",
            "-T",
            "--no-deps",
            "--entrypoint",
            "tar",
            "api",
            "-czf",
            "-",
            "-C",
            "/var/lib/rentaid/media",
            ".",
          ],
          { output: join(path, "media.tar.gz") },
        );
        writeFileSync(
          join(path, "manifest.json"),
          JSON.stringify(
            {
              version: 1,
              createdAt: new Date().toISOString(),
              project,
              files: {
                "database.dump": hash(join(path, "database.dump")),
                "media.tar.gz": hash(join(path, "media.tar.gz")),
              },
            },
            null,
            2,
          ) + "\n",
          { mode: 0o600 },
        );
      } finally {
        await run(["up", "-d", "--wait", "--wait-timeout", "180", "api"]);
      }
      return path;
    },
    async restore(directory) {
      const path = resolve(directory);
      const manifest = JSON.parse(
        readFileSync(join(path, "manifest.json"), "utf8"),
      );
      if (manifest.version !== 1)
        throw new Error("Format backup tidak didukung.");
      for (const file of ["database.dump", "media.tar.gz"]) {
        if (manifest.files?.[file] !== hash(join(path, file)))
          throw new Error(`Checksum backup ${file} tidak sesuai.`);
      }
      const services = await running();
      if (["api", "web", "gateway"].some((s) => services.has(s)))
        throw new Error(
          "Restore memerlukan project target kosong dengan aplikasi belum berjalan.",
        );
      await run(["build", "api", "web", "gateway"]);
      await run(["up", "-d", "--wait", "postgres"]);
      const tables = await run(
        [
          "exec",
          "-T",
          "postgres",
          "psql",
          "-U",
          "rentaid",
          "-d",
          "rentaid",
          "-At",
          "-c",
          "SELECT count(*) FROM pg_tables WHERE schemaname='public'",
        ],
        { capture: true },
      );
      if (tables !== "0")
        throw new Error(
          "Database target berisi tabel. Gunakan project baru untuk restore.",
        );
      const media = await run(
        [
          "run",
          "--rm",
          "-T",
          "--no-deps",
          "--entrypoint",
          "sh",
          "api",
          "-c",
          "ls -A /var/lib/rentaid/media",
        ],
        { capture: true },
      );
      if (media) throw new Error("Volume media target harus kosong.");
      const entries = await run(
        [
          "run",
          "--rm",
          "-T",
          "--no-deps",
          "--entrypoint",
          "tar",
          "api",
          "-tzf",
          "-",
        ],
        { input: join(path, "media.tar.gz"), capture: true },
      );
      if (
        entries
          .split(/\r?\n/)
          .some((name) => !/^\.\/?$|^\.\/[0-9a-f]{32}$/.test(name))
      )
        throw new Error("Nama berkas media dalam backup tidak valid.");
      const types = await run(
        [
          "run",
          "--rm",
          "-T",
          "--no-deps",
          "--entrypoint",
          "tar",
          "api",
          "-tvzf",
          "-",
        ],
        { input: join(path, "media.tar.gz"), capture: true },
      );
      if (types.split(/\r?\n/).some((line) => !/^[-d]/.test(line)))
        throw new Error("Jenis berkas media dalam backup tidak valid.");
      await run(
        [
          "exec",
          "-T",
          "postgres",
          "pg_restore",
          "-U",
          "rentaid",
          "-d",
          "rentaid",
          "--no-owner",
          "--no-acl",
          "--exit-on-error",
        ],
        { input: join(path, "database.dump") },
      );
      await run(
        [
          "run",
          "--rm",
          "-T",
          "--no-deps",
          "--entrypoint",
          "tar",
          "api",
          "-xzf",
          "-",
          "-C",
          "/var/lib/rentaid/media",
        ],
        { input: join(path, "media.tar.gz") },
      );
      await run([
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "180",
        "api",
        "web",
        "gateway",
      ]);
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const action = process.argv[2],
      ops = demo();
    if (["up", "down", "seed"].includes(action)) await ops[action]();
    else if (["backup", "restore"].includes(action) && process.argv[3]) {
      const result = await ops[action](process.argv[3]);
      if (result) console.log(result);
    } else
      throw new Error(
        "Gunakan demo.mjs up|down|seed|backup <direktori-baru>|restore <direktori-backup>.",
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
