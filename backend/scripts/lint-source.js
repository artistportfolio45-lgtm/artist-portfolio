const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "coverage"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith(".js")) files.push(target);
  }
};
for (const folder of ["config", "middleware", "models", "routes", "utils"]) walk(path.join(root, folder));
const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const label = path.relative(root, file);
  if (/^(<{7}|={7}|>{7})/m.test(source)) failures.push(`${label}: unresolved merge marker`);
  if (/process\.env\.[A-Z_]*(?:SECRET|PASSWORD|TOKEN)[A-Z_]*\s*\)/.test(source) && /console\.(?:log|error)/.test(source)) {
    // Only flag direct environment-value logging, not ordinary configuration usage.
    if (/console\.(?:log|error)\([^\n]*process\.env\./.test(source)) failures.push(`${label}: potential secret logging`);
  }
  try { new Function("require", "module", "exports", "__dirname", "__filename", source); }
  catch (error) { failures.push(`${label}: ${error.message}`); }
}
if (failures.length) throw new Error(`Backend lint failed:\n${failures.join("\n")}`);
console.log(`Syntax and security lint passed for ${files.length} backend files.`);
