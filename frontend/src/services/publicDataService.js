import api from "./api";
import { buildArtworkSearchSuggestions } from "../utils/artworkSearch";
import { queryPublicArtworks } from "../utils/artworkCollection";

const PUBLIC_BLOB_URL = "/api/public-portfolio";
const LEGACY_PORTFOLIO_CACHE_KEYS = [
  "artist-portfolio:portfolio",
  "artist-portfolio:public-data",
  "portfolioCache",
  "portfolioData",
  "publicPortfolio",
];
const REVALIDATE_AFTER_MS = 60_000;
export const ARTWORKS_CHANGED_EVENT = "artist-portfolio:artworks-changed";

const emptyPortfolio = {
  schemaVersion: 3,
  snapshotVersion: null,
  version: null,
  generatedAt: null,
  artworkCount: 0,
  settings: null,
  profile: null,
  about: null,
  artworks: [],
  categories: [],
  collections: [],
};

let cachedPortfolio = null;
let cachedEtag = null;
let portfolioPromise = null;
let forceNextRefresh = false;
let lastValidatedAt = 0;
let refreshQueued = false;

const clearLegacyPortfolioCaches = () => {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_PORTFOLIO_CACHE_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Storage can be disabled; public data remains memory-only either way.
  }
};

clearLegacyPortfolioCaches();

const unwrap = (payload) => {
  if (!payload) return payload;
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return { ...payload, ...payload.data };
  }
  return payload;
};

const normalizeImage = (image) => {
  if (!image) return null;
  if (typeof image === "string") return { url: image, width: null, height: null };
  const url = image.url || image.secure_url || image.secureUrl || image.imageUrl || image.src;
  if (!url) return null;
  try {
    if (/\.gif(?:$|[?#])/i.test(new URL(url, "https://artist-portfolio.invalid").pathname)) return null;
  } catch {
    return null;
  }
  return {
    url,
    width: Number(image.width) > 0 ? Number(image.width) : null,
    height: Number(image.height) > 0 ? Number(image.height) : null,
  };
};

const normalizeTextList = (value) => {
  const items = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
};

export const normalizeArtwork = (artwork) => {
  if (!artwork || typeof artwork !== "object") return null;
  const id = artwork._id || artwork.id || artwork.slug || artwork.title;
  const isAvailable = artwork.isAvailable ?? artwork.available
    ?? (artwork.availability ? artwork.availability === "available" : undefined)
    ?? artwork.status !== "sold";
  const images = [
    ...(Array.isArray(artwork.images) ? artwork.images : []),
    artwork.image,
    artwork.imageUrl,
    artwork.thumbnail,
  ].map(normalizeImage).filter(Boolean)
    .filter((image, index, all) => all.findIndex((candidate) => candidate.url === image.url) === index);
  const rawPrice = artwork.price === "" || artwork.price === undefined || artwork.price === null ? null : Number(artwork.price);
  const rawYear = artwork.year === "" || artwork.year === undefined || artwork.year === null ? null : Number(artwork.year);

  return {
    _id: String(id || ""),
    ...(artwork.slug ? { slug: String(artwork.slug) } : {}),
    title: String(artwork.title || "").trim() || "Untitled",
    description: String(artwork.description || "").trim(),
    category: String(artwork.category || "").trim() || "Uncategorized",
    price: Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : null,
    medium: String(artwork.medium || "").trim(),
    dimensions: String(artwork.dimensions || "").trim(),
    collection: String(artwork.collection || "").trim(),
    series: String(artwork.series || "").trim(),
    catalogueNumber: String(artwork.catalogueNumber || "").trim(),
    provenance: String(artwork.provenance || "").trim(),
    exhibitionHistory: String(artwork.exhibitionHistory || "").trim(),
    publications: String(artwork.publications || "").trim(),
    creationLocation: String(artwork.creationLocation || "").trim(),
    tags: normalizeTextList(artwork.tags),
    keywords: normalizeTextList(artwork.keywords),
    publicationStatus: String(artwork.publicationStatus || "published"),
    year: Number.isFinite(rawYear) ? rawYear : null,
    images,
    isAvailable: isAvailable !== false,
    isFeatured: artwork.isFeatured ?? artwork.featured ?? false,
    createdAt: artwork.createdAt || null,
    updatedAt: artwork.updatedAt || null,
  };
};

const normalizeArtworksArray = (value) => {
  const byId = new Map();
  (Array.isArray(value) ? value : []).map(normalizeArtwork).filter((artwork) => artwork?._id)
    .forEach((artwork) => byId.set(artwork._id, artwork));
  return [...byId.values()];
};

export const normalizePortfolio = (data) => {
  const payload = unwrap(data) || {};
  const artworks = normalizeArtworksArray(payload.artworks || payload.results || payload.items || []);
  const settings = payload.settings && typeof payload.settings === "object"
    ? {
      ...payload.settings,
      recentAdditionsArtworkIds: Array.isArray(payload.settings.recentAdditionsArtworkIds)
        ? payload.settings.recentAdditionsArtworkIds.map((id) => String(id))
        : [],
    }
    : null;
  const categories = [...new Set([
    ...(Array.isArray(payload.categories) ? payload.categories : []),
    ...artworks.map((artwork) => artwork.category || "Uncategorized"),
  ].filter(Boolean))].sort();
  const collections = [...new Set([
    ...(Array.isArray(payload.collections) ? payload.collections : []),
    ...artworks.map((artwork) => artwork.collection).filter(Boolean),
  ])].sort();
  return {
    ...emptyPortfolio,
    ...payload,
    settings,
    profile: payload.profile || null,
    about: payload.about || null,
    artworks,
    artworkCount: artworks.length,
    categories,
    collections,
  };
};

const loadBlobPortfolio = async ({ forceRefresh = false } = {}) => {
  const shouldRevalidate = forceRefresh || forceNextRefresh || !cachedPortfolio;
  if (!shouldRevalidate && cachedPortfolio) return { ...cachedPortfolio, source: "blob", isStale: false };

  const headers = { Accept: "application/json" };
  if (cachedEtag) headers["If-None-Match"] = cachedEtag;
  const response = await fetch(PUBLIC_BLOB_URL, { cache: "no-store", headers });
  if (response.status === 304 && cachedPortfolio) {
    forceNextRefresh = false;
    lastValidatedAt = Date.now();
    return { ...cachedPortfolio, source: "blob", isStale: false };
  }
  if (!response.ok) throw new Error(`Public portfolio Blob request failed: ${response.status}`);
  const portfolio = normalizePortfolio(await response.json());
  if (!portfolio.snapshotVersion || !Array.isArray(portfolio.artworks)) throw new Error("Public portfolio Blob response was invalid");
  cachedPortfolio = portfolio;
  cachedEtag = response.headers.get("etag") || `"${portfolio.snapshotVersion}"`;
  forceNextRefresh = false;
  lastValidatedAt = Date.now();
  return { ...portfolio, source: "blob", isStale: false };
};

const loadRenderFallback = async () => {
  const response = await api.get("/public-data", {
    params: { _t: Date.now() },
    timeout: 15000,
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  const portfolio = normalizePortfolio(response.data);
  if (!portfolio.snapshotVersion || !Array.isArray(portfolio.artworks)) throw new Error("Render public portfolio response was invalid");
  cachedPortfolio = portfolio;
  cachedEtag = null;
  forceNextRefresh = false;
  lastValidatedAt = Date.now();
  return { ...portfolio, source: "render-fallback", isStale: false };
};

const loadPortfolio = ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && !forceNextRefresh && cachedPortfolio) {
    return Promise.resolve({ ...cachedPortfolio, source: "memory", isStale: false });
  }
  if (portfolioPromise) return portfolioPromise;
  portfolioPromise = loadBlobPortfolio({ forceRefresh })
    .catch((blobError) => loadRenderFallback().catch((renderError) => {
      const unavailable = new Error("Public portfolio is unavailable");
      unavailable.causes = [blobError, renderError];
      throw unavailable;
    }))
    .finally(() => { portfolioPromise = null; });
  return portfolioPromise;
};

const queueArtworkRefresh = () => {
  if (typeof window === "undefined" || refreshQueued) return;
  if (Date.now() - lastValidatedAt < REVALIDATE_AFTER_MS) return;
  refreshQueued = true;
  window.setTimeout(() => {
    refreshQueued = false;
    if (document.visibilityState !== "hidden") {
      forceNextRefresh = true;
      window.dispatchEvent(new CustomEvent(ARTWORKS_CHANGED_EVENT));
    }
  }, 150);
};

export const notifyArtworksChanged = () => {
  forceNextRefresh = true;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ARTWORKS_CHANGED_EVENT));
};

export const subscribeToArtworkRefresh = (callback) => {
  if (typeof window === "undefined") return () => {};
  const refresh = () => document.visibilityState !== "hidden" && callback();
  window.addEventListener(ARTWORKS_CHANGED_EVENT, refresh);
  window.addEventListener("online", queueArtworkRefresh);
  window.addEventListener("focus", queueArtworkRefresh);
  return () => {
    window.removeEventListener(ARTWORKS_CHANGED_EVENT, refresh);
    window.removeEventListener("online", queueArtworkRefresh);
    window.removeEventListener("focus", queueArtworkRefresh);
  };
};

const maybeNotify = (callback, value) => {
  callback?.(value);
  return value;
};

export const publicDataAPI = {
  getPortfolio: async ({ onLiveData, forceRefresh = false } = {}) =>
    maybeNotify(onLiveData, await loadPortfolio({ forceRefresh })),

  getSettings: async ({ onLiveData } = {}) => {
    const portfolio = await loadPortfolio();
    return maybeNotify(onLiveData, portfolio.settings);
  },

  getProfile: async ({ onLiveData } = {}) => {
    const portfolio = await loadPortfolio();
    return maybeNotify(onLiveData, portfolio.profile);
  },

  getAbout: async ({ onLiveData } = {}) => {
    const portfolio = await loadPortfolio();
    return maybeNotify(onLiveData, portfolio.about);
  },

  getArtworks: async (params = {}, { onLiveData } = {}) => {
    const portfolio = await loadPortfolio();
    const result = {
      ...queryPublicArtworks(portfolio.artworks, params),
      source: portfolio.source || "memory",
      isStale: false,
      generatedAt: portfolio.generatedAt,
      snapshotVersion: portfolio.snapshotVersion,
    };
    return maybeNotify(onLiveData, result);
  },

  getSearchSuggestions: async (query, limit = 8) => {
    const portfolio = await loadPortfolio();
    return buildArtworkSearchSuggestions(portfolio.artworks, query, limit);
  },

  getArtworkById: async (id, { onLiveData } = {}) => {
    const portfolio = await loadPortfolio();
    const artwork = portfolio.artworks.find((item) => item._id === id || item.slug === id) || null;
    return maybeNotify(onLiveData, artwork);
  },

  getArtworkNeighbors: async (id) => {
    const portfolio = await loadPortfolio();
    const index = portfolio.artworks.findIndex((artwork) => artwork._id === id);
    if (index < 0) return { previous: null, next: null };
    return {
      previous: portfolio.artworks[index + 1] || null,
      next: portfolio.artworks[index - 1] || null,
    };
  },

  getCategories: async ({ onLiveData } = {}) => {
    const portfolio = await loadPortfolio();
    return maybeNotify(onLiveData, portfolio.categories);
  },

  retry: async () => {
    forceNextRefresh = true;
    return loadPortfolio({ forceRefresh: true });
  },
};
