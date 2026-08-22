import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { sanitizePublicSnapshot } from "../src/utils/publicArtwork.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const outputPath = resolve(__dirname, "../public/data/portfolio.json");
const localEnv = loadEnv(process.env.NODE_ENV || "production", frontendRoot, "");
const DEFAULT_PRODUCTION_API_URL = "https://artist-portfolio-0kkz.onrender.com/api";
const apiUrl =
  process.env.PUBLIC_DATA_API_URL ||
  process.env.VITE_API_URL ||
  localEnv.PUBLIC_DATA_API_URL ||
  localEnv.VITE_API_URL ||
  DEFAULT_PRODUCTION_API_URL;

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);

  if (!response.ok) {
    const error = new Error(`Request to ${url} failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
};

const fetchPublicSnapshot = async (baseUrl) => {
  const [settingsPayload, profilePayload, aboutPayload, categoriesPayload, firstArtworkPayload] =
    await Promise.all([
      fetchJson(`${baseUrl}/settings`),
      fetchJson(`${baseUrl}/profile`),
      fetchJson(`${baseUrl}/about`),
      fetchJson(`${baseUrl}/artworks/categories`),
      fetchJson(`${baseUrl}/artworks?limit=100&page=1&sort=createdAt&order=desc`),
    ]);
  const pagination = firstArtworkPayload.pagination || {};
  const pageCount = Math.max(1, Number(pagination.pages) || 1);
  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      fetchJson(
        `${baseUrl}/artworks?limit=100&page=${index + 2}&sort=createdAt&order=desc`
      )
    )
  );
  const artworks = [firstArtworkPayload, ...remainingPages].flatMap(
    (payload) => payload.artworks || []
  );

  return {
    generatedAt: new Date().toISOString(),
    settings: settingsPayload.settings || null,
    profile: profilePayload.profile || null,
    about: aboutPayload.about || null,
    artworks,
    categories: categoriesPayload.categories || [],
  };
};

const fetchSnapshot = async () => {
  const configuredUrl = apiUrl.replace(/\/+$/, "");
  const baseUrl = configuredUrl.replace(/\/public-data$/, "");
  const url = configuredUrl.endsWith("/public-data")
    ? configuredUrl
    : `${configuredUrl}/public-data`;

  try {
    return await fetchJson(url);
  } catch (error) {
    console.warn(
      `Aggregate public data was unavailable (${error.message}); fetching public resources directly.`
    );
    return fetchPublicSnapshot(baseUrl);
  }
};

const validateSnapshot = (snapshot, label, { allowEmpty = true } = {}) => {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error(`${label} is not an object`);
  }

  if (!Array.isArray(snapshot.artworks)) {
    throw new Error(`${label} must contain an artworks array`);
  }

  if (!allowEmpty && snapshot.artworks.length === 0) {
    throw new Error(`${label} was rejected because it contains no artworks`);
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
  let existingSnapshot = null;
  try {
    existingSnapshot = await readExistingSnapshot();
  } catch {
    existingSnapshot = null;
  }

  const snapshot = sanitizePublicSnapshot(await fetchSnapshot());

  validateSnapshot(snapshot, "Live public data snapshot", {
    allowEmpty: !existingSnapshot || existingSnapshot.artworks.length === 0,
  });
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
