const crypto = require("crypto");
const Artwork = require("../models/Artwork");
const Settings = require("../models/Settings");
const ArtistProfile = require("../models/ArtistProfile");
const AboutPage = require("../models/AboutPage");
const { publicAboutContent } = require("./aboutPage");
const { serializeSettingsWithHero } = require("./homeHero");
const { sanitizePublicArtwork } = require("./publicArtwork");

const PUBLIC_SETTINGS_FIELDS = [
  "websiteTitle", "websiteDescription", "logoUrl", "footerText",
  "heroEyebrow", "heroHeading", "heroHeadingAccent", "heroSubtitle",
  "heroPrimaryButtonText", "heroSecondaryButtonText", "heroBackgroundSource",
  "heroBackgroundAltText", "heroBackgroundPosition", "heroOverlayOpacity",
  "primaryColor", "secondaryColor", "accentColor", "themePreset", "themeMode",
  "backgroundColor", "surfaceColor", "textColor", "mutedTextColor", "borderColor",
  "buttonRadius", "cardRadius", "maintenanceMode", "seoTitle", "seoDescription",
  "seoKeywords", "contactEmail", "contactPhone", "contactAddress", "instagram",
  "facebook", "youtube", "whatsapp", "expectedResponseTime", "privacyReassurance",
  "studioVisitInformation", "additionalSocialLinks", "heroBackground",
];

const PUBLIC_PROFILE_FIELDS = [
  "name", "profilePhoto", "about", "email", "phone", "whatsapp",
  "instagram", "facebook", "youtube", "address",
];

const toPlainObject = (document) => {
  if (!document) return {};
  return document.toObject ? document.toObject({ versionKey: false }) : document;
};

const pickFields = (source, fields) => Object.fromEntries(
  fields.filter((field) => source?.[field] !== undefined).map((field) => [field, source[field]])
);

const removeManagementFields = (value) => {
  if (Array.isArray(value)) return value.map(removeManagementFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["publicId", "logoPublicId", "profilePhotoPublicId", "updatedBy", "__v"].includes(key))
    .map(([key, entry]) => [key, removeManagementFields(entry)]));
};

const sanitizePublicSettings = (settings, heroArtwork) => {
  const serialized = serializeSettingsWithHero(settings, heroArtwork);
  return removeManagementFields(pickFields(serialized, PUBLIC_SETTINGS_FIELDS));
};

const sanitizePublicProfile = (profile) => pickFields(toPlainObject(profile), PUBLIC_PROFILE_FIELDS);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

const snapshotVersionFor = (content) => crypto
  .createHash("sha256")
  .update(JSON.stringify(canonicalize(content)))
  .digest("hex");

const buildPublicSnapshot = async ({ now = () => new Date() } = {}) => {
  const [storedSettings, storedProfile, storedAboutPage, artworks] = await Promise.all([
    Settings.findOne(),
    ArtistProfile.findOne(),
    AboutPage.findOne(),
    Artwork.find({ publicationStatus: { $nin: ["draft", "unpublished", "archived"] } })
      .sort({ createdAt: -1, _id: -1 })
      .lean({ versionKey: false }),
  ]);
  const settings = storedSettings || new Settings();
  const profile = storedProfile || new ArtistProfile();
  const aboutPage = storedAboutPage || new AboutPage();
  const heroArtwork = settings.heroBackgroundSource === "artwork"
    ? artworks.find((artwork) => String(artwork._id) === String(settings.heroBackgroundArtworkId))
    : null;
  const publicArtworks = artworks.map(sanitizePublicArtwork);
  const publicContent = {
    settings: sanitizePublicSettings(settings, heroArtwork),
    profile: sanitizePublicProfile(profile),
    about: removeManagementFields(publicAboutContent(aboutPage)),
    artworks: publicArtworks,
    categories: [...new Set(publicArtworks.map((artwork) => artwork.category || "Uncategorized"))].sort(),
    collections: [...new Set(publicArtworks.map((artwork) => artwork.collection).filter(Boolean))].sort(),
  };
  const snapshotVersion = snapshotVersionFor(publicContent);

  return {
    schemaVersion: 3,
    snapshotVersion,
    version: snapshotVersion,
    generatedAt: now().toISOString(),
    artworkCount: publicArtworks.length,
    ...publicContent,
  };
};

module.exports = {
  buildPublicSnapshot,
  canonicalize,
  removeManagementFields,
  sanitizePublicProfile,
  sanitizePublicSettings,
  snapshotVersionFor,
};
