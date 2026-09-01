import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public runtime data is Blob-first, shared in memory, ETag-aware, and Render-backed", async () => {
  const data = await source("src/services/publicDataService.js");
  assert.match(data, /PUBLIC_BLOB_URL = "\/api\/public-portfolio"/);
  assert.match(data, /if \(portfolioPromise\) return portfolioPromise/);
  assert.match(data, /If-None-Match/);
  assert.match(data, /response\.status === 304/);
  assert.match(data, /api\.get\("\/public-data"/);
  assert.match(data, /cachedPortfolio/);
  assert.match(data, /localStorage\.removeItem/);
  assert.doesNotMatch(data, /\/data\/portfolio\.json/);
  assert.doesNotMatch(data, /localStorage\.setItem/);
  assert.doesNotMatch(data, /scheduleArtworkRetry|setInterval/);
  assert.match(data, /isStale: false/);
});

test("Blob and Render failure leaves a graceful retry state without static artwork flash", async () => {
  const [data, gallery] = await Promise.all([
    source("src/services/publicDataService.js"),
    source("src/pages/public/GalleryPage.jsx"),
  ]);
  assert.match(data, /new Error\("Public portfolio is unavailable"\)/);
  assert.doesNotMatch(data, /portfolio\.json/);
  assert.match(gallery, /useState\(\[\]\)/);
  assert.match(gallery, /useState\(true\)/);
  assert.match(gallery, /Gallery unavailable/);
  assert.match(gallery, />\s*Retry\s*</);
});

test("bulk upload defers item writes and performs one final sync per completed or stopped run", async () => {
  const upload = await source("src/pages/admin/BulkArtworkUploadPage.jsx");
  assert.match(upload, /deferPublicSync: true/);
  assert.equal((upload.match(/publicSnapshotAPI\.sync\(/g) || []).length, 2);
  assert.match(upload, /publicSnapshotAPI\.sync\("bulk-upload-completed"\)/);
  assert.match(upload, /publicSnapshotAPI\.sync\("bulk-upload-stopped"\)/);
});

test("390px Gallery layout retains explicit horizontal overflow protection", async () => {
  const [styles, gallery] = await Promise.all([source("src/index.css"), source("src/pages/public/GalleryPage.jsx")]);
  assert.match(styles, /\.public-shell\s*\{[^}]*min-width: 0;[^}]*overflow-x: clip;/s);
  assert.match(styles, /@media \(max-width: 1023px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(gallery, /w-full min-w-0 sm:w-0 sm:flex-1/);
  assert.match(gallery, /gallery-category-nav mt-4 overflow-x-auto/);
});

test("public phone and tablet layouts preserve features without oversized or clipped controls", async () => {
  const [layout, nav, hero, gallery, masonry, card, styles] = await Promise.all([
    source("src/components/public/PublicLayout.jsx"),
    source("src/components/public/Navbar.jsx"),
    source("src/components/public/HomeHero.jsx"),
    source("src/pages/public/GalleryPage.jsx"),
    source("src/components/public/ArtworkMasonry.jsx"),
    source("src/components/public/ArtworkCard.jsx"),
    source("src/index.css"),
  ]);
  assert.match(layout, /grid-cols-4/);
  assert.match(layout, /bottom-20 right-3[^"]*lg:bottom-5/);
  assert.match(nav, /PublicSocialLinks tone="dark"/);
  assert.doesNotMatch(hero, /button: "w-full text-center/);
  assert.doesNotMatch(gallery, /fixed bottom-24 right-4/);
  assert.match(masonry, /artwork-masonry-mobile-caption bg-white/);
  assert.match(card, /featured-artwork-actions/);
  assert.match(styles, /\.artwork-masonry-mobile-caption\s*\{\s*display: block;/);
  assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)/);
});

test("admin exposes a protected manual action for initial Blob seed and retry", async () => {
  const [layout, api] = await Promise.all([source("src/components/admin/AdminLayout.jsx"), source("src/services/api.js")]);
  assert.match(layout, /Sync Public Data/);
  assert.match(layout, /Retry Public Sync/);
  assert.match(api, /api\.post\("\/public-data\/sync"/);
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
  assert.match(masonry, /retrySrcSet/);
  assert.match(masonry, /withRetryToken\(url, attempt\)/);
  assert.match(html, /rel="preconnect" href="https:\/\/res\.cloudinary\.com"/);
});

test("gallery image state is local to each keyed artwork card, so one delivery failure cannot block neighbours", async () => {
  const masonry = await source("src/components/public/ArtworkMasonry.jsx");
  assert.match(masonry, /key=\{artwork\._id\}/);
  assert.match(masonry, /const \[status, setStatus\] = useState\("loading"\)/);
  assert.match(masonry, /Image unavailable/);
});

test("Button Shape is applied to plain controls as well as shared button classes", async () => {
  const css = await source("src/index.css");
  assert.match(css, /button:not\(\[data-fixed-button-shape\]\)/);
  assert.match(css, /border-radius: var\(--theme-button-radius\) !important/);
});

test("production snapshot generation has a live Render API fallback", async () => {
  const generator = await source("scripts/generate-public-data.mjs");
  assert.match(generator, /DEFAULT_PRODUCTION_API_URL = "https:\/\/artist-portfolio-0kkz\.onrender\.com\/api"/);
  assert.match(generator, /localEnv\.VITE_API_URL \|\|\s*DEFAULT_PRODUCTION_API_URL/);
});

test("gallery provides debounced URL filters, pagination and cached retry state", async () => {
  const gallery = await source("src/pages/public/GalleryPage.jsx");
  for (const token of ["setTimeout", "collection", "medium", "year", "Gallery pagination", "setSearchParams"]) assert.ok(gallery.includes(token), token);
  assert.doesNotMatch(gallery, /hidden lg:flex[^\n]+Gallery pagination/);
  assert.doesNotMatch(gallery, />Load More</);
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

test("Netlify Forms backup posts to a published static form endpoint outside the catch-all 404 route", async () => {
  const [forms, staticForm, redirects] = await Promise.all([
    source("src/services/netlifyForms.js"),
    source("public/netlify-forms.html"),
    source("public/_redirects"),
  ]);
  assert.match(forms, /NETLIFY_FORMS_ENDPOINT = "\/netlify-forms\.html"/);
  assert.match(forms, /fetch\(NETLIFY_FORMS_ENDPOINT/);
  assert.match(staticForm, /form name="artwork-inquiry"[^>]*data-netlify="true"/);
  assert.match(staticForm, /form name="contact"[^>]*data-netlify="true"/);
  assert.match(redirects, /\/api\/public-portfolio\s+\/\.netlify\/functions\/public-portfolio\s+200/);
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
  const [home, styles] = await Promise.all([source("src/pages/public/HomePage.jsx"), source("src/index.css")]);
  assert.match(home, /aria-label="Featured artwork carousel"/);
  assert.match(home, /featured-artworks-carousel flex snap-x snap-mandatory[^\"]*overflow-x-auto/);
  assert.match(home, /lg:w-\[calc\(\(100%_-_4rem\)\/3\)\]/);
  assert.doesNotMatch(home, /grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10/);
  assert.match(styles, /\.featured-artworks-carousel\s*\{[^}]*scrollbar-width: none;/s);
  assert.match(styles, /\.featured-artworks-carousel::\-webkit-scrollbar\s*\{[^}]*display: none;/s);
});

test("artwork image collections use the compact half-gap rhythm at every breakpoint", async () => {
  const [styles, home, detail, about] = await Promise.all([
    source("src/index.css"), source("src/pages/public/HomePage.jsx"),
    source("src/pages/public/ArtworkDetailPage.jsx"), source("src/pages/public/AboutPage.jsx"),
  ]);
  for (const token of ["column-gap: 6px", "gap: 7px", "gap: 0.5rem", "margin-top: 0.5rem", "column-gap: 7px"]) assert.ok(styles.includes(token), token);
  assert.match(home, /featured-artworks-carousel[^\"]*gap-3[^\"]*md:gap-4/);
  assert.match(detail, /flex gap-1 overflow-x-auto pb-2/);
  assert.match(about, /flex snap-x gap-1\.5 overflow-x-auto/);
  assert.match(about, /mt-12 grid gap-2\.5 sm:grid-cols-2/);
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
