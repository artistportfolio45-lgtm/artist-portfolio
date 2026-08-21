const text = (value) => String(value || "").trim();
const textList = (value) => {
  const values = Array.isArray(value) ? value : text(value).split(/[,;\n]/);
  return [...new Set(values.map(text).filter(Boolean))].slice(0, 40);
};

export const sanitizeSnapshotArtwork = (artwork = {}) => {
  const price = artwork.price === "" || artwork.price === null || artwork.price === undefined
    ? null
    : Number(artwork.price);
  const year = artwork.year === "" || artwork.year === null || artwork.year === undefined
    ? null
    : Number(artwork.year);
  return {
    _id: text(artwork._id || artwork.id),
    ...(artwork.slug ? { slug: text(artwork.slug) } : {}),
    title: text(artwork.title) || "Untitled",
    description: text(artwork.description),
    category: text(artwork.category) || "Uncategorized",
    price: Number.isFinite(price) && price >= 0 ? price : null,
    medium: text(artwork.medium),
    dimensions: text(artwork.dimensions),
    collection: text(artwork.collection),
    series: text(artwork.series),
    catalogueNumber: text(artwork.catalogueNumber),
    provenance: text(artwork.provenance),
    exhibitionHistory: text(artwork.exhibitionHistory),
    publications: text(artwork.publications),
    creationLocation: text(artwork.creationLocation),
    tags: textList(artwork.tags),
    keywords: textList(artwork.keywords),
    publicationStatus: "published",
    isAvailable: artwork.isAvailable !== false,
    isFeatured: artwork.isFeatured === true,
    images: (Array.isArray(artwork.images) ? artwork.images : [])
      .filter((image) => image?.url)
      .map((image) => ({
        url: image.url,
        width: Number(image.width) > 0 ? Number(image.width) : null,
        height: Number(image.height) > 0 ? Number(image.height) : null,
      })),
    year: Number.isFinite(year) ? year : null,
    createdAt: artwork.createdAt || null,
    updatedAt: artwork.updatedAt || null,
  };
};

export const sanitizePublicSnapshot = (snapshot) => ({
  ...snapshot,
  artworks: (Array.isArray(snapshot?.artworks) ? snapshot.artworks : [])
    .map(sanitizeSnapshotArtwork)
    .filter((artwork) => artwork._id),
  categories: [...new Set((Array.isArray(snapshot?.categories) ? snapshot.categories : [])
    .map(text)
    .filter(Boolean))],
});
