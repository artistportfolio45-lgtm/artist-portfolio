import { searchAndRankArtworks } from "./artworkSearch.js";

export const filterPublicArtworks = (artworks, params = {}) =>
  (Array.isArray(artworks) ? artworks : []).filter((artwork) => {
    if (["draft", "unpublished", "archived"].includes(artwork.publicationStatus)) return false;
    if (
      params.category &&
      params.category !== "all" &&
      artwork.category?.toLowerCase() !== params.category.toLowerCase()
    ) return false;
    if (params.available === "true" && !artwork.isAvailable) return false;
    if (params.available === "false" && artwork.isAvailable) return false;
    if (params.featured === "true" && !artwork.isFeatured) return false;
    if (Array.isArray(params.ids) && params.ids.length && !params.ids.map(String).includes(String(artwork._id))) return false;
    if (params.collection && !String(artwork.collection || "").toLowerCase().includes(String(params.collection).toLowerCase())) return false;
    if (params.medium && !String(artwork.medium || "").toLowerCase().includes(String(params.medium).toLowerCase())) return false;
    if (params.year && Number(artwork.year) !== Number(params.year)) return false;
    if (params.decade && (Number(artwork.year) < Number(params.decade) || Number(artwork.year) > Number(params.decade) + 9)) return false;
    return true;
  });

export const compareArtworks = (sort = "createdAt", order = "desc") => (firstArtwork, secondArtwork) => {
  const direction = order === "asc" ? 1 : -1;
  const sortKey = sort || "createdAt";
  const first = firstArtwork?.[sortKey];
  const second = secondArtwork?.[sortKey];
  let difference = 0;

  if (sortKey === "price" || sortKey === "year") {
    const firstMissing = first === null || first === undefined || first === "";
    const secondMissing = second === null || second === undefined || second === "";
    if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;
    if (!firstMissing) difference = Number(first) - Number(second);
  } else if (sortKey === "isAvailable" || sortKey === "isFeatured") {
    difference = Number(Boolean(first)) - Number(Boolean(second));
  } else if (sortKey === "createdAt" || sortKey === "updatedAt") {
    difference = new Date(first || 0) - new Date(second || 0);
  } else {
    difference = String(first || "").localeCompare(String(second || ""));
  }

  return difference * direction ||
    String(firstArtwork?._id || "").localeCompare(String(secondArtwork?._id || "")) * direction;
};

export const paginateArtworks = (items, page = 1, limit = 12) => {
  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(limit, 10) || 12);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      total: items.length,
      page: currentPage,
      limit: pageSize,
      pages: Math.ceil(items.length / pageSize),
    },
  };
};

export const queryPublicArtworks = (artworks, params = {}) => {
  const filtered = filterPublicArtworks(artworks, params);
  const tieBreaker = compareArtworks(params.sort, params.order);
  const ordered = params.search
    ? searchAndRankArtworks(filtered, params.search, tieBreaker)
    : [...filtered].sort(tieBreaker);
  return paginateArtworks(ordered, params.page, params.limit);
};
