import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile masonry declares its actual two-column width and compact image candidates", async () => {
  const [masonry, imageDelivery] = await Promise.all([
    source("src/components/public/ArtworkMasonry.jsx"),
    source("src/utils/imageDelivery.js"),
  ]);

  assert.match(masonry, /calc\(50vw - 20px\)/);
  assert.doesNotMatch(masonry, /calc\(100vw - 32px\)/);
  assert.match(imageDelivery, /\[240, 320, 480, 720, 960, 1440\]/);
});

test("critical public controls retain accessible names, contrast and touch targets", async () => {
  const [footer, hero, home, contact, gallery, backButton, socialLinks] = await Promise.all([
    source("src/components/public/Footer.jsx"),
    source("src/components/public/HomeHero.jsx"),
    source("src/pages/public/HomePage.jsx"),
    source("src/pages/public/ContactPage.jsx"),
    source("src/pages/public/GalleryPage.jsx"),
    source("src/components/shared/BackButton.jsx"),
    source("src/components/public/PublicSocialLinks.jsx"),
  ]);

  assert.doesNotMatch(footer, /aria-label="Admin"/);
  assert.doesNotMatch(footer, /text-white\/30/);
  assert.doesNotMatch(footer, /<h3/);
  assert.match(footer, /min-h-11/);
  assert.match(hero, /eyebrow text-white\/80/);
  assert.match(home, /eyebrow mb-4 text-white\/80/);
  assert.match(contact, /eyebrow mb-3 text-white\/80/);
  assert.match(gallery, /min-h-11 min-w-11/);
  assert.match(gallery, /Go to page<\/label>/);
  assert.match(backButton, /inline-flex min-h-11/);
  assert.match(socialLinks, /min-h-11 min-w-11/);
});

test("profile and Hero images expose smaller responsive Cloudinary variants", async () => {
  const [navbar, hero] = await Promise.all([
    source("src/components/public/Navbar.jsx"),
    source("src/components/public/HomeHero.jsx"),
  ]);

  assert.match(navbar, /cloudinaryThumbnailUrl\(profile\.profilePhoto, mobile \? 96 : 160\)/);
  assert.match(navbar, /sizes=\{mobile \? "40px" : "64px"\}/);
  assert.match(hero, /\[480, 768, 960, 1440, 2400\]/);
});

test("theme derives accessible accent text and button foreground colors", async () => {
  const [bootstrap, styles] = await Promise.all([
    source("public/theme-bootstrap.js"),
    source("src/index.css"),
  ]);

  assert.match(bootstrap, /--theme-accent-foreground/);
  assert.match(bootstrap, /--theme-accent-readable/);
  assert.match(styles, /color: var\(--theme-accent-foreground\)/);
  assert.match(styles, /color: var\(--theme-accent-readable\)/);
  const buttonRule = styles.match(/\.btn-gold\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.doesNotMatch(buttonRule, /text-white/);
});
