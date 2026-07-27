import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, "../public/data/portfolio.json");
const apiUrl = process.env.PUBLIC_DATA_API_URL || process.env.VITE_API_URL;
const exportKey = process.env.PUBLIC_DATA_EXPORT_KEY;

const fetchSnapshot = async () => {
  if (!apiUrl) {
    return null;
  }

  const url = `${apiUrl.replace(/\/$/, "")}/public-data`;
  const headers = exportKey ? { "x-static-export-key": exportKey } : {};
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch public data from ${url}: ${response.status}`);
  }

  return response.json();
};

const validateSnapshot = (snapshot, label) => {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error(`${label} is not an object`);
  }

  if (!Array.isArray(snapshot.artworks)) {
    throw new Error(`${label} must contain an artworks array`);
  }

  if (!Array.isArray(snapshot.categories)) {
    throw new Error(`${label} must contain a categories array`);
  }

  return snapshot;
};

const readExistingSnapshot = async () => {
  const existing = await readFile(outputPath, "utf8");
  return validateSnapshot(JSON.parse(existing), "Existing public data snapshot");
};

try {
  const snapshot = await fetchSnapshot();

  if (!snapshot) {
    await readExistingSnapshot();
    console.log("No PUBLIC_DATA_API_URL or VITE_API_URL set. Existing public data snapshot retained.");
    process.exit(0);
  }

  validateSnapshot(snapshot, "Live public data snapshot");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Live public data snapshot generated at ${outputPath}`);
} catch (error) {
  try {
    await readExistingSnapshot();
    console.warn(`Live public data was not generated: ${error.message}`);
    console.log("Existing public data snapshot retained.");
  } catch (existingError) {
    console.warn(`No valid public data snapshot is available: ${existingError.message}`);
  }
  process.exit(0);
}
