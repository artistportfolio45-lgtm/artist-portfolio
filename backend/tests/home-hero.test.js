const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Settings = require("../models/Settings");
const {
  getOwnedHeroUpload,
  isOwnedHeroUpload,
  normalizeHomeHeroPayload,
  serializeSettingsWithHero,
} = require("../utils/homeHero");

const source = (relativePath) =>
  fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");

const validPayload = (changes = {}) => ({
  heroEyebrow: "Original Fine Art",
  heroHeading: "Art That",
  heroHeadingAccent: "Speaks",
  heroSubtitle: "A portfolio introduction.",
  heroPrimaryButtonText: "Explore Gallery",
  heroSecondaryButtonText: "Get in Touch",
  heroBackgroundSource: "upload",
  heroBackgroundAltText: "The artist working in a sunlit studio",
  heroBackgroundPosition: "center",
  heroOverlayOpacity: 0.55,
  ...changes,
});

test("Home Hero settings default to a safe background with no automatic artwork", () => {
  const settings = new Settings();
  const serialized = serializeSettingsWithHero(settings);
  assert.equal(settings.heroBackgroundSource, "none");
  assert.equal(serialized.heroBackgroundSource, "none");
  assert.equal(serialized.heroBackground, null);
});

test("dedicated uploads serialize their owned Cloudinary image", () => {
  const settings = {
    ...validPayload(),
    heroBackgroundUrl: "https://res.cloudinary.com/demo/image/upload/hero.jpg",
    heroBackgroundPublicId: "artist-portfolio/home/hero",
    heroBackgroundWidth: 2000,
    heroBackgroundHeight: 1200,
  };
  const serialized = serializeSettingsWithHero(settings);
  assert.equal(serialized.heroBackground.source, "upload");
  assert.equal(serialized.heroBackground.publicId, "artist-portfolio/home/hero");
  assert.equal(serialized.heroBackground.width, 2000);
});

test("existing artwork selection references its current primary image without copying its public id", () => {
  const settings = validPayload({
    heroBackgroundSource: "artwork",
    heroBackgroundArtworkId: "64b000000000000000000001",
  });
  const artwork = {
    _id: "64b000000000000000000001",
    title: "Morning Light",
    images: [{
      url: "https://res.cloudinary.com/demo/image/upload/artwork.jpg",
      publicId: "artist-portfolio/artworks/morning-light",
      width: 1800,
      height: 2400,
    }],
  };
  const serialized = serializeSettingsWithHero(settings, artwork);
  assert.equal(serialized.heroBackground.source, "artwork");
  assert.equal(serialized.heroBackground.artworkId, artwork._id);
  assert.equal(serialized.heroBackground.url, artwork.images[0].url);
  assert.equal(serialized.heroBackground.publicId, "");
});

test("missing selected artwork falls back safely instead of choosing another artwork", () => {
  const settings = validPayload({
    heroBackgroundSource: "artwork",
    heroBackgroundArtworkId: "64b000000000000000000001",
  });
  const serialized = serializeSettingsWithHero(settings, null);
  assert.equal(serialized.heroBackgroundSource, "none");
  assert.equal(serialized.heroBackground, null);
});

test("Home Hero controls validate source, alt text, position, overlay, and text length", () => {
  assert.equal(normalizeHomeHeroPayload(validPayload()).heroOverlayOpacity, 0.55);
  assert.throws(
    () => normalizeHomeHeroPayload(validPayload({ heroBackgroundAltText: "" })),
    /alt text is required/
  );
  assert.throws(
    () => normalizeHomeHeroPayload(validPayload({ heroBackgroundPosition: "stretch" })),
    /valid Hero image position/
  );
  assert.throws(
    () => normalizeHomeHeroPayload(validPayload({ heroOverlayOpacity: 0.05 })),
    /between 20% and 90%/
  );
  assert.throws(
    () => normalizeHomeHeroPayload(validPayload({ heroHeading: "x".repeat(141) })),
    /140 characters or fewer/
  );
});

test("Cloudinary deletion ownership excludes artwork, About, and unrelated images", () => {
  assert.equal(isOwnedHeroUpload("artist-portfolio/home/dedicated-photo"), true);
  assert.equal(isOwnedHeroUpload("artist-portfolio/artworks/painting"), false);
  assert.equal(isOwnedHeroUpload("artist-portfolio/about/archive"), false);
  assert.equal(isOwnedHeroUpload("artist-portfolio/settings/logo"), false);

  assert.equal(getOwnedHeroUpload({
    heroBackgroundSource: "artwork",
    heroBackgroundPublicId: "artist-portfolio/home/old-value",
  }), null);
  assert.equal(getOwnedHeroUpload({
    heroBackgroundSource: "upload",
    heroBackgroundPublicId: "artist-portfolio/artworks/painting",
  }), null);
  assert.equal(getOwnedHeroUpload({
    heroBackgroundSource: "upload",
    heroBackgroundPublicId: "artist-portfolio/home/dedicated-photo",
  }).publicId, "artist-portfolio/home/dedicated-photo");
});

test("Home Hero routes cover upload, artwork selection, removal, replacement, and public sync", () => {
  const routes = source("routes/settings.js");
  const cloudinary = source("config/cloudinary.js");
  const snapshot = source("utils/publicSnapshot.js");

  assert.match(routes, /router\.put\("\/home"/);
  assert.match(routes, /router\.put\("\/home\/background"/);
  assert.match(routes, /values\.heroBackgroundSource === "artwork"/);
  assert.match(routes, /values\.heroBackgroundSource === "none"/);
  assert.match(routes, /previousUpload\.publicId !== newUpload\.publicId/);
  assert.match(routes, /syncPublicData\("home-hero-updated"\)/);
  assert.match(routes, /syncPublicData\("home-hero-image-updated"\)/);
  assert.match(cloudinary, /folder: "artist-portfolio\/home"/);
  assert.match(cloudinary, /fileSize: 12 \* 1024 \* 1024/);
  assert.match(cloudinary, /ARTWORK_IMAGE_MIME_TYPES\.has\(file\.mimetype\)/);
  assert.match(snapshot, /serializeSettingsWithHero\(settings, heroArtwork\)/);
  assert.match(snapshot, /recentAdditionsArtworkIds/);
});
