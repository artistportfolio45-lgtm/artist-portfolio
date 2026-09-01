const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "../..");
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build"]);
const sourceExtensions = new Set([".js", ".mjs", ".jsx", ".ts", ".tsx"]);

const sourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  if (entry.isDirectory()) {
    return ignoredDirectories.has(entry.name)
      ? []
      : sourceFiles(path.join(directory, entry.name));
  }

  return sourceExtensions.has(path.extname(entry.name))
    ? [path.join(directory, entry.name)]
    : [];
});

const applicationSourceFiles = ["backend", "frontend"]
  .flatMap((directory) => sourceFiles(path.join(projectRoot, directory)));

test("tracked source contains no credential-bearing MongoDB URI", () => {
  const credentialUri = /mongodb(?:\+srv)?:\/\/[^/\s:@]+:[^@\s]+@/i;
  const offenders = applicationSourceFiles
    .filter((file) => credentialUri.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(projectRoot, file));

  assert.deepEqual(offenders, []);
});

test("source does not print MongoDB credentials from the environment", () => {
  const directSecretLog = /console\.(?:log|info|debug)\([^\n]*(?:MONGO_URI|process\.env\.MONGO_URI)/i;
  const offenders = applicationSourceFiles
    .filter((file) => directSecretLog.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(projectRoot, file));

  assert.deepEqual(offenders, []);
});
