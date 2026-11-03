import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

mkdirSync(resolve(".artifacts"), { recursive: true });
const output = mkdtempSync(resolve(".artifacts/android-client-"));
const generator = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--mount",
    `type=bind,source=${resolve("packages/contracts")},target=/contract,readonly`,
    "--mount",
    `type=bind,source=${output},target=/output`,
    "openapitools/openapi-generator-cli:v7.13.0",
    "generate",
    "-i",
    "/contract/openapi.json",
    "-g",
    "kotlin",
    "-o",
    "/output",
    "--global-property",
    "apis,models,supportingFiles",
    "--additional-properties",
    "packageName=id.rentaid.client,library=jvm-okhttp4,serializationLibrary=gson,dateLibrary=java8,enumPropertyNaming=original",
    "--skip-validate-spec",
  ],
  { stdio: "inherit" },
);
if (generator.status !== 0) process.exit(generator.status ?? 1);
const source = join(output, "src/main/kotlin");
const target = resolve("apps/android/generated/src/main/kotlin");
function files(path, prefix = "") {
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const name = join(prefix, entry.name);
      return entry.isDirectory() ? files(join(path, entry.name), name) : [name];
    })
    .sort();
}
if (process.argv.includes("--check")) {
  const expected = files(source);
  const actual = existsSync(target) ? files(target) : [];
  if (
    JSON.stringify(expected) !== JSON.stringify(actual) ||
    expected.some(
      (name) =>
        !readFileSync(join(source, name)).equals(
          readFileSync(join(target, name)),
        ),
    )
  ) {
    console.error("Kotlin client is out of date; run pnpm android:generate.");
    process.exit(1);
  }
  console.log("Kotlin OpenAPI client is up to date.");
} else {
  if (
    existsSync(target) &&
    files(target).some((name) => !files(source).includes(name))
  ) {
    throw new Error(
      "Obsolete generated files exist; remove them before regenerating.",
    );
  }
  cpSync(source, target, { recursive: true });
}
