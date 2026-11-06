import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const failures = [];
for (const root of [
  "apps/web/features",
  "apps/web/app",
  "apps/admin/src/features",
  "apps/admin/src/app",
]) {
  for (const path of files(root).filter((path) => /\.tsx?$/.test(path))) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const normalized = path.replaceAll("\\", "/");
    const application = normalized.includes("/application/");
    const data = normalized.includes("/data/");
    const presentation =
      normalized.includes("/components/") ||
      normalized.endsWith("/app/App.tsx") ||
      (!application &&
        !data &&
        source.statements.some(
          (node) =>
            ts.isExpressionStatement(node) &&
            ts.isStringLiteral(node.expression) &&
            node.expression.text === "use client",
        ));
    function inspect(node) {
      if (ts.isImportDeclaration(node)) {
        const dependency = node.moduleSpecifier.text;
        if (
          ((presentation || application) &&
            /(?:^|\/)lib\/api$/.test(dependency)) ||
          (presentation && dependency.includes("/data/")) ||
          (application && dependency.includes("/components/")) ||
          (data && /\/(?:application|components)\//.test(dependency))
        ) {
          failures.push(`${path}: invalid layer dependency ${dependency}`);
        }
      }
      if (
        (presentation || application) &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ["fetch", "createApiClient"].includes(node.expression.text)
      ) {
        failures.push(`${path}: HTTP calls belong in the data layer`);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
}

for (const path of files("apps/api/internal").filter(
  (path) =>
    path.endsWith(".go") &&
    !path.endsWith("_test.go") &&
    !/[\\/](?:database|demo|httpapi)[\\/]/.test(path) &&
    !path.endsWith("postgres.go"),
)) {
  if (/\.(?:QueryRow|Exec|Query)\(/.test(readFileSync(path, "utf8"))) {
    failures.push(`${path}: database queries belong in postgres.go`);
  }
}

for (const path of files("apps/android/app/src/main/java").filter((path) =>
  path.endsWith(".kt"),
)) {
  const source = readFileSync(path, "utf8");
  if (
    /[\\/]data[\\/]/.test(path) &&
    /^import id\.rentaid\.app\..*\.presentation\./m.test(source)
  ) {
    failures.push(`${path}: data must not depend on presentation`);
  }
}

if (failures.length) throw new Error(failures.join("\n"));
console.log("Application layer boundaries passed.");
