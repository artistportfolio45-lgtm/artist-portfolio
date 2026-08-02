const Artwork = require("../models/Artwork");
const Settings = require("../models/Settings");
const ArtistProfile = require("../models/ArtistProfile");
const { getOrCreateAboutPage, publicAboutContent } = require("./aboutPage");

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

const normalizeArtwork = (artwork) => ({
  ...artwork,
  title: artwork.title?.trim() || "Untitled",
  description: artwork.description?.trim() || "",
  category: artwork.category?.trim() || "Uncategorized",
  price: Number.isFinite(artwork.price) && artwork.price >= 0 ? artwork.price : null,
  medium: artwork.medium?.trim() || "",
  dimensions: artwork.dimensions?.trim() || "",
  year: Number.isFinite(artwork.year) ? artwork.year : null,
  isAvailable: artwork.isAvailable !== false,
  isFeatured: artwork.isFeatured === true,
  images: Array.isArray(artwork.images) ? artwork.images.filter((image) => image?.url) : [],
});

const buildPublicSnapshot = async () => {
  const [settings, profile, aboutPage, artworks, categories] = await Promise.all([
    getOrCreateSettings(),
    getOrCreateProfile(),
    getOrCreateAboutPage(),
    Artwork.find({}).sort({ createdAt: -1 }).lean({ versionKey: false }),
    Artwork.distinct("category"),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    settings: toPlainObject(settings),
    profile: toPlainObject(profile),
    about: publicAboutContent(aboutPage),
    artworks: artworks.map(normalizeArtwork),
    categories: [...new Set([
      ...categories.filter(Boolean),
      ...artworks.map((artwork) => artwork.category?.trim() || "Uncategorized"),
    ])].sort(),
  };
};

module.exports = { buildPublicSnapshot };
