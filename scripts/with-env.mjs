import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const envPath = resolve(root, ".env");
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("A command is required.");
  process.exit(2);
}

let content;
try {
  content = readFileSync(envPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  content = "";
}

const env = { ...process.env };
for (const line of content.split(/\r?\n/)) {
  const match = line.match(
    /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
  );
  if (!match || match[1] in process.env) continue;

  let value = match[2];
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  env[match[1]] = value;
}

const child = spawn(args[0], args.slice(1), {
  cwd: root,
  env,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
