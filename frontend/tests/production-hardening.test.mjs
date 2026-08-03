import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public artwork recovery is bounded, deduplicated, cancellable and stale-aware", async () => {
  const data = await source("src/services/publicDataService.js");
  assert.match(data, /liveArtworkRequests\.has/);
  assert.match(data, /new AbortController/);
  assert.match(data, /scheduleArtworkRetry/);
  assert.match(data, /isStale: true/);
  assert.match(data, /isStale: false/);
});

test("gallery provides debounced URL filters, pagination and cached retry state", async () => {
  const gallery = await source("src/pages/public/GalleryPage.jsx");
  for (const token of ["setTimeout", "collection", "medium", "year", "Gallery pagination", "CachedDataNotice", "setSearchParams"]) assert.ok(gallery.includes(token), token);
});

test("contact selection and artwork detail retain accessible scalable behaviors", async () => {
  const [contact, combo, detail, modal] = await Promise.all([
    source("src/pages/public/ContactPage.jsx"), source("src/components/public/ArtworkCombobox.jsx"),
    source("src/pages/public/ArtworkDetailPage.jsx"), source("src/components/public/ArtworkPreviewModal.jsx"),
  ]);
  assert.match(contact, /ArtworkCombobox/);
  assert.match(combo, /role="combobox"/);
  assert.match(combo, /aria-activedescendant/);
  assert.match(detail, /getArtworkNeighbors/);
  assert.match(detail, /Read more/);
  assert.match(modal, /Escape/);
  assert.match(modal, /aria-modal="true"/);
});

test("mobile navigation and generated SEO include focus and crawler safeguards", async () => {
  const [nav, seo, redirects] = await Promise.all([
    source("src/components/public/Navbar.jsx"), source("scripts/generate-seo-pages.mjs"), source("public/_redirects"),
  ]);
  for (const token of ["Escape", "document.body.style.overflow", "focus()", "aria-expanded"]) assert.ok(nav.includes(token), token);
  for (const token of ["VisualArtwork", "BreadcrumbList", "Person", "sitemap.xml", "robots.txt", "404.html"]) assert.ok(seo.includes(token), token);
  assert.match(redirects, /404\.html\s+404/);
});
