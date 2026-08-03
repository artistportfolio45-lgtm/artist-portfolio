import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1");
const files = [];
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["dist", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if ([".js", ".jsx", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
};
await walk(join(root, "src"));
await walk(join(root, "scripts"));

const failures = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  const label = relative(root, file);
  if (label.endsWith("lint-source.mjs")) continue;
  if (/^(<{7}|={7}|>{7})/m.test(text)) failures.push(`${label}: unresolved merge marker`);
  if (/dangerouslySetInnerHTML/.test(text)) failures.push(`${label}: unsafe raw HTML rendering is not allowed`);
  if (/href\s*=\s*["']javascript:/i.test(text)) failures.push(`${label}: javascript URL is not allowed`);
  if (/VITE_(?:SECRET|PRIVATE|PASSWORD|MONGO|CLOUDINARY_API_SECRET)/.test(text)) failures.push(`${label}: secret-like Vite variable would be public`);
}
if (failures.length) throw new Error(`Source policy lint failed:\n${failures.join("\n")}`);
console.log(`Source policy lint passed for ${files.length} frontend files.`);
