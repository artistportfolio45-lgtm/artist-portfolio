import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getHomeHeroPresentation } from "../src/utils/homeHero.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Home Hero defaults to the safe colour background with no selected image", () => {
  const presentation = getHomeHeroPresentation({});
  assert.equal(presentation.background, null);
  assert.equal(presentation.heading, "Art That");
  assert.equal(presentation.headingAccent, "Speaks");
});

test("Home Hero uses only an explicitly selected upload or artwork", () => {
  const upload = getHomeHeroPresentation({
    heroBackground: {
      source: "upload",
      url: "https://res.cloudinary.com/demo/image/upload/hero.jpg",
      altText: "Studio portrait",
      position: "top",
      overlayOpacity: 0.65,
    },
  });
  assert.equal(upload.background.source, "upload");
  assert.equal(upload.background.position, "top");
  assert.equal(upload.background.overlayOpacity, 0.65);

  const invalid = getHomeHeroPresentation({
    heroBackground: { source: "featured", url: "https://example.com/automatic.jpg" },
  });
  assert.equal(invalid.background, null);
});

test("overlay and image position values are bounded for readable rendering", () => {
  const low = getHomeHeroPresentation({
    heroBackground: { source: "upload", url: "x", position: "stretch", overlayOpacity: 0 },
  });
  const high = getHomeHeroPresentation({
    heroBackground: { source: "artwork", url: "x", position: "right", overlayOpacity: 1 },
  });
  assert.equal(low.background.position, "center");
  assert.equal(low.background.overlayOpacity, 0.2);
  assert.equal(high.background.position, "right");
  assert.equal(high.background.overlayOpacity, 0.9);
});

test("Home page never derives the Hero from Featured Works or Recent Additions", async () => {
  const home = await source("src/pages/public/HomePage.jsx");
  assert.match(home, /<HomeHero settings=\{settings\}/);
  assert.doesNotMatch(home, /featured\?\.\[0\].*images/);
  assert.doesNotMatch(home, /latestArtworks\?\.\[0\].*images/);
  assert.doesNotMatch(home, /Featured artwork hero/);
});

test("shared Hero component renders selected backgrounds and a safe fallback responsively", async () => {
  const hero = await source("src/components/public/HomeHero.jsx");
  for (const mode of ["mobile", "tablet", "desktop", "responsive"]) {
    assert.ok(hero.includes(mode), mode);
  }
  assert.match(hero, /data-hero-background-source=\{background\?\.source \|\| "none"\}/);
  assert.match(hero, /bg-charcoal/);
  assert.match(hero, /objectPosition: background\.position/);
  assert.match(hero, /data-hero-overlay=\{background\.overlayOpacity\}/);
  assert.match(hero, /fetchPriority="high"/);
  assert.match(hero, /srcSet=\{imageSrcSet \|\| undefined\}/);
  assert.match(hero, /sizes="100vw"/);
  assert.match(hero, /onError=\{\(\) => setFailedUrl\(imageUrl\)\}/);
});

test("Admin Home Page editor provides full background lifecycle controls", async () => {
  const [editor, api, app, layout] = await Promise.all([
    source("src/pages/admin/HomePageEditor.jsx"),
    source("src/services/api.js"),
    source("src/App.jsx"),
    source("src/components/admin/AdminLayout.jsx"),
  ]);

  for (const label of [
    "Current background preview",
    "Upload/Replace Photo",
    "Select Existing Artwork",
    "Remove Background",
    "Background alt text",
    "Image position",
    "Overlay darkness",
    "Save Home Page",
    "Cancel",
  ]) assert.ok(editor.includes(label), label);

  for (const viewport of ["Mobile", "Tablet", "Desktop", "max-w-[390px]", "max-w-[768px]", "max-w-[1180px]"]) {
    assert.ok(editor.includes(viewport), viewport);
  }

  assert.match(editor, /MAX_HERO_FILE_SIZE = 12 \* 1024 \* 1024/);
  assert.match(editor, /HERO_FILE_TYPES\.has\(file\.type\)/);
  assert.match(editor, /settingsAPI\.uploadHomeBackground/);
  assert.match(editor, /settingsAPI\.updateHome/);
  assert.match(api, /put\("\/settings\/home\/background"/);
  assert.match(app, /path="\/admin\/home-page"/);
  assert.match(layout, /label: "Home Page"/);
});
