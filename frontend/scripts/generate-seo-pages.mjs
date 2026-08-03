import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const siteUrl = (process.env.PUBLIC_SITE_URL || process.env.VITE_SITE_URL || "https://artistportfolio45.netlify.app").replace(/\/$/, "");
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const stripHtml = (value = "") => String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const template = await readFile(resolve(dist, "index.html"), "utf8");
let snapshot = { settings: {}, profile: {}, artworks: [] };
try { snapshot = JSON.parse(await readFile(resolve(root, "public/data/portfolio.json"), "utf8")); } catch { /* valid empty SEO output is preferable to a failed deployment */ }

const settings = snapshot.settings || {};
const siteTitle = settings.seoTitle || settings.websiteTitle || "Artist Portfolio";
const defaultDescription = settings.seoDescription || settings.websiteDescription || "Original artworks and selected works from the artist's studio.";
const published = (snapshot.artworks || []).filter((art) => !["draft", "unpublished", "archived"].includes(art.publicationStatus));
const breadcrumb = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, path], index) => ({ "@type": "ListItem", position: index + 1, name, item: `${siteUrl}${path}` })) });

const render = ({ title, description, path, image, type = "website", schema }) => {
  const canonical = `${siteUrl}${path === "/" ? "" : path}`;
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(stripHtml(description).slice(0, 300));
  const tags = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDescription}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDescription}" />`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}" /><meta name="twitter:image" content="${escapeHtml(image)}" />` : "",
    schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>` : "",
  ].filter(Boolean).join("\n    ");
  const cleanTemplate = template.replace(/\s*<meta (?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/g, "");
  return cleanTemplate
    .replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${safeDescription}" />`)
    .replace("</head>", `    ${tags}\n  </head>`);
};

const writePage = async (path, options) => {
  const output = path === "/" ? resolve(dist, "index.html") : resolve(dist, path.slice(1), "index.html");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, render({ ...options, path }));
};

await writePage("/", { title: siteTitle, description: defaultDescription, schema: { "@context": "https://schema.org", "@type": "WebSite", name: siteTitle, url: siteUrl } });
await writePage("/gallery", { title: `Gallery | ${siteTitle}`, description: "Browse original artworks, collections, media and available works.", schema: breadcrumb([["Home", ""], ["Gallery", "/gallery"]]) });
const artistName = String(snapshot.profile?.name || snapshot.about?.hero?.name || "").trim();
const personSchema = artistName ? { "@context": "https://schema.org", "@type": "Person", name: artistName, url: `${siteUrl}/about`, image: snapshot.profile?.photoUrl || snapshot.about?.hero?.portrait?.url || undefined, jobTitle: snapshot.profile?.title || "Artist" } : null;
await writePage("/about", { title: `About | ${siteTitle}`, description: "Learn about the artist, studio practice, exhibitions and creative journey.", schema: personSchema ? [personSchema, breadcrumb([["Home", ""], ["About", "/about"]])] : breadcrumb([["Home", ""], ["About", "/about"]]) });
await writePage("/contact", { title: `Contact | ${siteTitle}`, description: "Contact the studio about artwork availability, commissions and visits.", schema: breadcrumb([["Home", ""], ["Contact", "/contact"]]) });

for (const art of published) {
  const id = art._id || art.id;
  if (!id) continue;
  const image = art.images?.[0]?.url || art.imageUrl || undefined;
  const path = `/artwork/${encodeURIComponent(id)}`;
  const description = art.description || [art.medium, art.year, art.dimensions].filter(Boolean).join(" · ") || defaultDescription;
  await writePage(path, {
    title: `${art.title || "Artwork"} | ${siteTitle}`,
    description,
    image,
    type: "article",
    schema: [{
      "@context": "https://schema.org", "@type": "VisualArtwork", name: art.title || "Artwork", description: stripHtml(description), image,
      artMedium: art.medium, dateCreated: art.year ? String(art.year) : undefined, url: `${siteUrl}${path}`,
    }, breadcrumb([["Home", ""], ["Gallery", "/gallery"], [art.title || "Artwork", path]])],
  });
}

const sitemapPaths = ["/", "/gallery", "/about", "/contact", ...published.map((art) => `/artwork/${encodeURIComponent(art._id || art.id)}`).filter((path) => !path.endsWith("undefined"))];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths.map((path) => `  <url><loc>${escapeHtml(`${siteUrl}${path === "/" ? "" : path}`)}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(resolve(dist, "sitemap.xml"), sitemap);
await writeFile(resolve(dist, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${siteUrl}/sitemap.xml\n`);
await writeFile(resolve(dist, "404.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page Not Found | ${escapeHtml(siteTitle)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f5f0;color:#1c1c1e;font-family:Arial,sans-serif;text-align:center}main{padding:2rem}h1{font:300 3rem Georgia,serif}a{color:#735f25}</style></head><body><main><p>404</p><h1>Page not found</h1><p>The page may have moved or may no longer be public.</p><a href="/">Return to the portfolio</a></main></body></html>`);
await mkdir(resolve(dist, "admin"), { recursive: true });
await writeFile(resolve(dist, "admin/index.html"), template
  .replace(/<title>[^<]*<\/title>/, "<title>Portfolio Administration</title>")
  .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow" />'));
console.log(`Generated SEO HTML for ${published.length} published artworks.`);
