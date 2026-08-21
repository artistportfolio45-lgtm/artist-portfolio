import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public artwork recovery is bounded, deduplicated, cancellable and stale-aware", async () => {
  const data = await source("src/services/publicDataService.js");
  assert.match(data, /liveArtworkRequests\.has/);
  assert.match(data, /cachedFallbackPortfolio/);
  assert.match(data, /requestLiveData/);
  assert.match(data, /new AbortController/);
  assert.match(data, /scheduleArtworkRetry/);
  assert.match(data, /isStale: true/);
  assert.match(data, /isStale: false/);
  assert.match(data, /const staticData = await getFallbackArtworks\(params\)/);
  assert.match(data, /getLiveArtworks\(params\)\s*\n\s*\.then/);
  assert.match(data, /12000/);
});

test("gallery images retry transient delivery failures before showing an error", async () => {
  const [masonry, html] = await Promise.all([
    source("src/components/public/ArtworkMasonry.jsx"),
    source("index.html"),
  ]);
  assert.match(masonry, /const IMAGE_RETRY_DELAYS = \[800, 2000\]/);
  assert.match(masonry, /portfolio_retry/);
  assert.match(masonry, /retryAttempt < IMAGE_RETRY_DELAYS\.length/);
  assert.match(masonry, /window\.clearTimeout\(retryTimerRef\.current\)/);
  assert.match(html, /rel="preconnect" href="https:\/\/res\.cloudinary\.com"/);
});

test("production snapshot generation has a live Render API fallback", async () => {
  const generator = await source("scripts/generate-public-data.mjs");
  assert.match(generator, /DEFAULT_PRODUCTION_API_URL = "https:\/\/artist-portfolio-0kkz\.onrender\.com\/api"/);
  assert.match(generator, /localEnv\.VITE_API_URL \|\|\s*DEFAULT_PRODUCTION_API_URL/);
});

test("gallery provides debounced URL filters, pagination and cached retry state", async () => {
  const gallery = await source("src/pages/public/GalleryPage.jsx");
  for (const token of ["setTimeout", "collection", "medium", "year", "Gallery pagination", "setSearchParams"]) assert.ok(gallery.includes(token), token);
  assert.doesNotMatch(gallery, /setLoadingPage\(true\);\s*setPage\(safePage\)/);
  assert.match(gallery, /resultPage === page/);
});

test("gallery ignores stale page requests when settling loading and errors", async () => {
  const gallery = await source("src/pages/public/GalleryPage.jsx");
  assert.match(gallery, /if \(requestId !== requestIdRef\.current\) return;\s*setError/);
  assert.match(gallery, /if \(requestId === requestIdRef\.current\) \{\s*setLoading\(false\);\s*setLoadingPage\(false\);/);
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
  assert.match(detail, /inquiryAPI\.create/);
  assert.match(detail, /Netlify backup artwork inquiry failed after backend save/);
  assert.match(detail, /Read more/);
  assert.match(modal, /Escape/);
  assert.match(modal, /aria-modal="true"/);
});

test("mobile navigation and generated SEO include focus and crawler safeguards", async () => {
  const [nav, seo, redirects] = await Promise.all([
    source("src/components/public/Navbar.jsx"), source("scripts/generate-seo-pages.mjs"), source("public/_redirects"),
  ]);
  for (const token of ["Escape", "document.body.style.overflow", "focus()", "aria-expanded"]) assert.ok(nav.includes(token), token);
  for (const token of ["G. N. Ambe", "Fine Art Portfolio", "GNA", "profilePhoto", "object-cover"]) assert.ok(nav.includes(token), token);
  for (const token of ["VisualArtwork", "BreadcrumbList", "Person", "sitemap.xml", "robots.txt", "404.html"]) assert.ok(seo.includes(token), token);
  for (const token of ["settings.seoTitle", "settings.seoDescription", "settings.seoKeywords", "https://artistportfolio46.netlify.app"]) assert.ok(seo.includes(token), token);
  assert.match(redirects, /404\.html\s+404/);
});

test("featured artworks stay in one horizontally scrollable row", async () => {
  const home = await source("src/pages/public/HomePage.jsx");
  assert.match(home, /aria-label="Featured artwork carousel"/);
  assert.match(home, /flex snap-x snap-mandatory[^\"]*overflow-x-auto/);
  assert.match(home, /lg:w-\[calc\(\(100%_-_4rem\)\/3\)\]/);
  assert.doesNotMatch(home, /grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10/);
});

test("Home requests nine latest artworks to fill three balanced columns", async () => {
  const home = await source("src/pages/public/HomePage.jsx");
  assert.match(home, /\{ limit: 9 \}/);
  assert.match(home, /skeletonCount=\{9\}/);
});

test("public themes refresh from live settings and Tailwind colors use theme variables", async () => {
  const settingsHook = await source("src/hooks/useSettings.js");
  const tailwind = await source("tailwind.config.js");
  assert.match(settingsHook, /getSettings\(\{ onLiveData: publishSettings \}\)/);
  assert.match(settingsHook, /artist-portfolio:settings-changed/);
  for (const variable of ["--theme-primary-rgb", "--theme-bg-rgb", "--theme-accent-rgb", "--theme-muted-rgb"]) {
    assert.ok(tailwind.includes(variable), variable);
  }
});
