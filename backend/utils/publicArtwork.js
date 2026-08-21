const cleanTextList = (value) => {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
  const seen = new Set();
  return values
    .map((item) => String(item || "").trim().slice(0, 80))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40);
};

const sanitizePublicImage = (image) => {
  if (!image?.url) return null;
  return {
    url: image.url,
    width: Number(image.width) > 0 ? Number(image.width) : null,
    height: Number(image.height) > 0 ? Number(image.height) : null,
  };
};

const sanitizePublicArtwork = (document) => {
  const artwork = document?.toObject
    ? document.toObject({ versionKey: false })
    : document || {};
  return {
    _id: String(artwork._id || artwork.id || ""),
    ...(artwork.slug ? { slug: String(artwork.slug) } : {}),
    title: String(artwork.title || "").trim() || "Untitled",
    description: String(artwork.description || "").trim(),
    category: String(artwork.category || "").trim() || "Uncategorized",
    price: Number.isFinite(artwork.price) && artwork.price >= 0 ? artwork.price : null,
    medium: String(artwork.medium || "").trim(),
    dimensions: String(artwork.dimensions || "").trim(),
    collection: String(artwork.collection || "").trim(),
    series: String(artwork.series || "").trim(),
    catalogueNumber: String(artwork.catalogueNumber || "").trim(),
    provenance: String(artwork.provenance || "").trim(),
    exhibitionHistory: String(artwork.exhibitionHistory || "").trim(),
    publications: String(artwork.publications || "").trim(),
    creationLocation: String(artwork.creationLocation || "").trim(),
    tags: cleanTextList(artwork.tags),
    keywords: cleanTextList(artwork.keywords),
    publicationStatus: "published",
    isAvailable: artwork.isAvailable !== false,
    isFeatured: artwork.isFeatured === true,
    images: (Array.isArray(artwork.images) ? artwork.images : []).map(sanitizePublicImage).filter(Boolean),
    year: Number.isFinite(artwork.year) ? artwork.year : null,
    createdAt: artwork.createdAt || null,
    updatedAt: artwork.updatedAt || null,
  };
};

module.exports = { cleanTextList, sanitizePublicArtwork, sanitizePublicImage };
