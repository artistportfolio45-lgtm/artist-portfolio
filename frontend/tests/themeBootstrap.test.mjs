import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const CACHE_KEY = "artist-portfolio:theme:v1";

const validTheme = (overrides = {}) => ({
  themePreset: "windows-light",
  themeMode: "light",
  primaryColor: "#202020",
  secondaryColor: "#F3F3F3",
  accentColor: "#0067C0",
  backgroundColor: "#F3F3F3",
  surfaceColor: "#FFFFFF",
  textColor: "#1B1B1B",
  mutedTextColor: "#5E5E5E",
  borderColor: "#DADADA",
  buttonRadius: "24px",
  cardRadius: "2px",
  ...overrides,
});

const runBootstrap = async (initial = {}, { storageUnavailable = false } = {}) => {
  const storage = new Map(Object.entries(initial));
  const variables = new Map();
  const documentElement = {
    dataset: {},
    style: { setProperty: (name, value) => variables.set(name, value) },
  };
  const window = {
    localStorage: {
      getItem: (key) => {
        if (storageUnavailable) throw new Error("Storage unavailable");
        return storage.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (storageUnavailable) throw new Error("Storage unavailable");
        storage.set(key, value);
      },
      removeItem: (key) => {
        if (storageUnavailable) throw new Error("Storage unavailable");
        storage.delete(key);
      },
    },
  };
  const code = await source("public/theme-bootstrap.js");
  vm.runInNewContext(code, { window, document: { documentElement } });
  return { api: window.ArtistPortfolioTheme, documentElement, storage, variables };
};

test("theme bootstrap runs before the React module and uses production defaults with an empty cache", async () => {
  const index = await source("index.html");
  assert.ok(index.indexOf("/theme-bootstrap.js") < index.indexOf("/src/main.jsx"));

  const runtime = await runBootstrap();
  assert.equal(runtime.documentElement.dataset.themeReady, "true");
  assert.equal(runtime.variables.get("--theme-accent"), "#0067C0");
  assert.equal(runtime.variables.get("--theme-button-radius"), "24px");
  assert.equal(runtime.variables.get("--theme-card-radius"), "2px");
});

test("a valid warm cache is applied synchronously and authoritative updates replace it", async () => {
  const warm = validTheme({ accentColor: "#B8325F", buttonRadius: "8px", cardRadius: "8px", themePreset: "rose" });
  const runtime = await runBootstrap({ [CACHE_KEY]: JSON.stringify({ version: 1, theme: warm }) });
  assert.equal(runtime.variables.get("--theme-accent"), "#B8325F");
  assert.equal(runtime.variables.get("--theme-button-radius"), "8px");

  const authoritative = validTheme({ accentColor: "#027C8E", buttonRadius: "6px", cardRadius: "8px", themePreset: "ocean" });
  assert.equal(runtime.api.cacheAndApply(authoritative), true);
  assert.equal(runtime.variables.get("--theme-accent"), "#027C8E");
  assert.deepEqual(JSON.parse(runtime.storage.get(CACHE_KEY)).theme, authoritative);
});

test("corrupted and injection-like cached values are rejected without reaching CSS", async () => {
  const corrupted = await runBootstrap({ [CACHE_KEY]: "{not-json" });
  assert.equal(corrupted.variables.get("--theme-accent"), "#0067C0");
  assert.equal(corrupted.storage.has(CACHE_KEY), false);

  const malicious = validTheme({ accentColor: "red;background:url(javascript:alert(1))" });
  const runtime = await runBootstrap({ [CACHE_KEY]: JSON.stringify({ version: 1, theme: malicious }) });
  assert.equal(runtime.variables.get("--theme-accent"), "#0067C0");
  assert.equal(runtime.api.cacheAndApply(malicious), false);
  assert.ok([...runtime.variables.values()].every((value) => !String(value).includes("javascript")));
});

test("private browsing or disabled localStorage still applies safe defaults without a blank screen", async () => {
  const runtime = await runBootstrap({}, { storageUnavailable: true });
  assert.equal(runtime.documentElement.dataset.themeReady, "true");
  assert.equal(runtime.variables.get("--theme-bg"), "#F3F3F3");
  assert.equal(runtime.variables.get("--theme-button-radius"), "24px");
});

test("a delayed authoritative production response causes no colour or radius shift", async () => {
  const runtime = await runBootstrap();
  const before = Object.fromEntries(runtime.variables);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runtime.api.cacheAndApply(validTheme()), true);
  assert.deepEqual(Object.fromEntries(runtime.variables), before);
});

test("cache persistence is allow-listed and React publishes only through the validated runtime", async () => {
  const runtime = await runBootstrap();
  assert.equal(runtime.api.cacheAndApply({ ...validTheme(), unexpected: "url(javascript:alert(1))" }), true);
  const cached = JSON.parse(runtime.storage.get(CACHE_KEY)).theme;
  assert.equal(Object.hasOwn(cached, "unexpected"), false);

  const [settingsHook, adminSettings] = await Promise.all([
    source("src/hooks/useSettings.js"),
    source("src/pages/admin/SettingsPage.jsx"),
  ]);
  assert.match(settingsHook, /ArtistPortfolioTheme\?\.cacheAndApply\(newSettings\)/);
  assert.match(adminSettings, /setCachedSettings\(res\.data\.settings\)/);
});

test("CSS first-visit fallbacks match the checked-in production theme snapshot", async () => {
  const [styles, snapshotText] = await Promise.all([
    source("src/index.css"),
    source("public/data/portfolio.json"),
  ]);
  const settings = JSON.parse(snapshotText).settings;
  for (const [variable, field] of [
    ["--theme-primary", "primaryColor"],
    ["--theme-accent", "accentColor"],
    ["--theme-bg", "backgroundColor"],
    ["--theme-text", "textColor"],
    ["--theme-button-radius", "buttonRadius"],
    ["--theme-card-radius", "cardRadius"],
  ]) {
    assert.match(styles, new RegExp(`${variable}:\\s*${settings[field].replace("#", "\\#")}`));
  }
});
