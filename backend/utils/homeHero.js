const HERO_BACKGROUND_SOURCES = new Set(["none", "upload", "artwork"]);
const HERO_BACKGROUND_POSITIONS = new Set(["center", "top", "bottom", "left", "right"]);
const HERO_UPLOAD_FOLDER = "artist-portfolio/home";
const HERO_UPLOAD_PREFIX = `${HERO_UPLOAD_FOLDER}/`;

const HOME_HERO_TEXT_LIMITS = {
  heroEyebrow: 100,
  heroHeading: 140,
  heroHeadingAccent: 140,
  heroSubtitle: 600,
  heroPrimaryButtonText: 80,
  heroSecondaryButtonText: 80,
  heroBackgroundAltText: 240,
};

class HomeHeroValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "HomeHeroValidationError";
  }
}

const cleanText = (value, field) => {
  const text = String(value ?? "").trim();
  const limit = HOME_HERO_TEXT_LIMITS[field];
  if (text.length > limit) {
    throw new HomeHeroValidationError(`${field} must be ${limit} characters or fewer`);
  }
  return text;
};

const normalizeHomeHeroPayload = (payload = {}) => {
  const source = String(payload.heroBackgroundSource || "none").trim().toLowerCase();
  const position = String(payload.heroBackgroundPosition || "center").trim().toLowerCase();
  const overlayOpacity = Number(payload.heroOverlayOpacity ?? 0.55);

  if (!HERO_BACKGROUND_SOURCES.has(source)) {
    throw new HomeHeroValidationError("Choose a valid Hero background source");
  }
  if (!HERO_BACKGROUND_POSITIONS.has(position)) {
    throw new HomeHeroValidationError("Choose a valid Hero image position");
  }
  if (!Number.isFinite(overlayOpacity) || overlayOpacity < 0.2 || overlayOpacity > 0.9) {
    throw new HomeHeroValidationError("Hero overlay opacity must be between 20% and 90%");
  }

  const normalized = {
    heroBackgroundSource: source,
    heroBackgroundPosition: position,
    heroOverlayOpacity: Math.round(overlayOpacity * 100) / 100,
    heroBackgroundAltText: cleanText(payload.heroBackgroundAltText, "heroBackgroundAltText"),
  };

  for (const field of Object.keys(HOME_HERO_TEXT_LIMITS)) {
    if (field !== "heroBackgroundAltText" && payload[field] !== undefined) {
      normalized[field] = cleanText(payload[field], field);
    }
  }

  if (source !== "none" && !normalized.heroBackgroundAltText) {
    throw new HomeHeroValidationError("Background alt text is required when a Hero image is selected");
  }

  if (source === "artwork") {
    normalized.heroBackgroundArtworkId = String(payload.heroBackgroundArtworkId || "").trim();
    if (!normalized.heroBackgroundArtworkId) {
      throw new HomeHeroValidationError("Select an artwork for the Hero background");
    }
  }

  return normalized;
};

const isOwnedHeroUpload = (publicId) =>
  typeof publicId === "string" && publicId.startsWith(HERO_UPLOAD_PREFIX);

const getOwnedHeroUpload = (settings) => {
  if (
    settings?.heroBackgroundSource !== "upload" ||
    !settings?.heroBackgroundPublicId ||
    !isOwnedHeroUpload(settings.heroBackgroundPublicId)
  ) {
    return null;
  }

  return {
    url: settings.heroBackgroundUrl || "",
    publicId: settings.heroBackgroundPublicId,
    width: Number(settings.heroBackgroundWidth) || null,
    height: Number(settings.heroBackgroundHeight) || null,
  };
};

const getArtworkHeroImage = (artwork) => {
  const image = Array.isArray(artwork?.images)
    ? artwork.images.find((item) => item?.url)
    : null;
  if (!image) return null;

  return {
    url: image.url,
    publicId: "",
    artworkId: String(artwork._id || artwork.id || ""),
    artworkTitle: String(artwork.title || "Untitled"),
    width: Number(image.width) || null,
    height: Number(image.height) || null,
  };
};

const serializeSettingsWithHero = (settings, artwork = null) => {
  const plain = settings?.toObject
    ? settings.toObject({ versionKey: false })
    : { ...(settings || {}) };
  const source = HERO_BACKGROUND_SOURCES.has(plain.heroBackgroundSource)
    ? plain.heroBackgroundSource
    : "none";
  let image = null;

  if (source === "upload" && plain.heroBackgroundUrl && isOwnedHeroUpload(plain.heroBackgroundPublicId)) {
    image = {
      url: plain.heroBackgroundUrl,
      publicId: plain.heroBackgroundPublicId,
      width: Number(plain.heroBackgroundWidth) || null,
      height: Number(plain.heroBackgroundHeight) || null,
    };
  } else if (source === "artwork") {
    image = getArtworkHeroImage(artwork);
  }

  return {
    ...plain,
    heroBackgroundSource: image ? source : "none",
    heroBackground: image ? {
      ...image,
      source,
      altText: plain.heroBackgroundAltText || image.artworkTitle || "",
      position: HERO_BACKGROUND_POSITIONS.has(plain.heroBackgroundPosition)
        ? plain.heroBackgroundPosition
        : "center",
      overlayOpacity: Number.isFinite(Number(plain.heroOverlayOpacity))
        ? Number(plain.heroOverlayOpacity)
        : 0.55,
    } : null,
  };
};

module.exports = {
  HERO_BACKGROUND_POSITIONS,
  HERO_BACKGROUND_SOURCES,
  HERO_UPLOAD_FOLDER,
  HOME_HERO_TEXT_LIMITS,
  HomeHeroValidationError,
  getArtworkHeroImage,
  getOwnedHeroUpload,
  isOwnedHeroUpload,
  normalizeHomeHeroPayload,
  serializeSettingsWithHero,
};
