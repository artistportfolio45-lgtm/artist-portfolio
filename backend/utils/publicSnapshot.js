const Artwork = require("../models/Artwork");
const Settings = require("../models/Settings");
const ArtistProfile = require("../models/ArtistProfile");
const { getOrCreateAboutPage, publicAboutContent } = require("./aboutPage");
const { serializeSettingsWithHero } = require("./homeHero");
const { sanitizePublicArtwork } = require("./publicArtwork");

const getOrCreateSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
};

const getOrCreateProfile = async () => {
  let profile = await ArtistProfile.findOne();
  if (!profile) {
    profile = await ArtistProfile.create({});
  }
  return profile;
};

const toPlainObject = (document) => {
  if (!document) return null;
  return document.toObject ? document.toObject({ versionKey: false }) : document;
};

const buildPublicSnapshot = async () => {
  const [settings, profile, aboutPage, artworks, categories] = await Promise.all([
    getOrCreateSettings(),
    getOrCreateProfile(),
    getOrCreateAboutPage(),
    Artwork.find({ publicationStatus: { $nin: ["draft", "unpublished", "archived"] } })
      .sort({ createdAt: -1, _id: -1 })
      .lean({ versionKey: false }),
    Artwork.distinct("category"),
  ]);
  const heroArtwork = settings.heroBackgroundSource === "artwork"
    ? artworks.find((artwork) => String(artwork._id) === String(settings.heroBackgroundArtworkId))
    : null;

  return {
    schemaVersion: 2,
    contentVersion: Math.max(
      ...artworks.map((artwork) => new Date(artwork.updatedAt || artwork.createdAt || 0).getTime()),
      new Date(settings.updatedAt || 0).getTime(),
      new Date(profile.updatedAt || 0).getTime(),
      0
    ),
    generatedAt: new Date().toISOString(),
    settings: serializeSettingsWithHero(settings, heroArtwork),
    profile: toPlainObject(profile),
    about: publicAboutContent(aboutPage),
    artworks: artworks.map(sanitizePublicArtwork),
    categories: [...new Set([
      ...categories.filter(Boolean),
      ...artworks.map((artwork) => artwork.category?.trim() || "Uncategorized"),
    ])].sort(),
  };
};

module.exports = { buildPublicSnapshot };
