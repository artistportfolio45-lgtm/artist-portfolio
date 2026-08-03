import api from "./api";

const STATIC_FALLBACK_URL = "/data/portfolio.json";
export const ARTWORKS_CHANGED_EVENT = "artist-portfolio:artworks-changed";

const emptyPortfolio = {
  generatedAt: null,
  settings: null,
  profile: null,
  about: null,
  artworks: [],
  categories: [],
};

let fallbackPortfolioPromise = null;
const liveArtworkRequests = new Map();
let retryTimer = null;
let retryAttempt = 0;
let refreshQueued = false;

const artworkRequestKey = (params = {}) => JSON.stringify(
  Object.entries(params).filter(([key]) => key !== "_t").sort(([a], [b]) => a.localeCompare(b))
);

const queueArtworkRefresh = () => {
  if (typeof window === "undefined" || refreshQueued) return;
  refreshQueued = true;
  window.setTimeout(() => {
    refreshQueued = false;
    if (document.visibilityState !== "hidden") notifyArtworksChanged();
  }, 150);
};

const clearArtworkRetry = () => {
  retryAttempt = 0;
  if (retryTimer) window.clearTimeout(retryTimer);
  retryTimer = null;
};

const scheduleArtworkRetry = () => {
  if (typeof window === "undefined" || retryTimer) return;
  const delays = [2000, 5000, 10000, 30000, 60000];
  const base = delays[Math.min(retryAttempt, delays.length - 1)];
  const jitter = Math.round(base * (Math.random() * 0.3 - 0.15));
  retryAttempt += 1;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    queueArtworkRefresh();
  }, base + jitter);
};

export const notifyArtworksChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ARTWORKS_CHANGED_EVENT));
  }
};

export const subscribeToArtworkRefresh = (callback) => {
  if (typeof window === "undefined") return () => {};

  const refresh = () => {
    if (document.visibilityState === "hidden") return;
    callback();
  };
  window.addEventListener(ARTWORKS_CHANGED_EVENT, refresh);
  window.addEventListener("online", queueArtworkRefresh);
  window.addEventListener("visibilitychange", queueArtworkRefresh);
  window.addEventListener("focus", queueArtworkRefresh);
  window.addEventListener("pageshow", queueArtworkRefresh);

  return () => {
    window.removeEventListener(ARTWORKS_CHANGED_EVENT, refresh);
    window.removeEventListener("online", queueArtworkRefresh);
    window.removeEventListener("visibilitychange", queueArtworkRefresh);
    window.removeEventListener("focus", queueArtworkRefresh);
    window.removeEventListener("pageshow", queueArtworkRefresh);
  };
};

const withNoStoreParam = (params = {}) => ({
  ...params,
  _t: Date.now(),
});

const unwrap = (payload) => {
  if (!payload) return payload;
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return { ...payload, ...payload.data };
  }
  return payload;
};

const normalizeImage = (image) => {
  if (!image) return null;
  if (typeof image === "string") return { url: image, publicId: "" };

  const url = image.url || image.secure_url || image.secureUrl || image.imageUrl || image.src;
  if (!url) return null;

  return {
    ...image,
    url,
    publicId: image.publicId || image.public_id || image.cloudinaryPublicId || "",
    width: Number(image.width) > 0 ? Number(image.width) : null,
    height: Number(image.height) > 0 ? Number(image.height) : null,
  };
};

export const normalizeArtwork = (artwork) => {
  if (!artwork || typeof artwork !== "object") return null;

  const id = artwork._id || artwork.id || artwork.slug || artwork.title;
  const isAvailable =
    artwork.isAvailable ??
    artwork.available ??
    (artwork.availability ? artwork.availability === "available" : undefined) ??
    artwork.status !== "sold";
  const images = [
    ...(Array.isArray(artwork.images) ? artwork.images : []),
    artwork.image,
    artwork.imageUrl,
    artwork.thumbnail,
  ]
    .map(normalizeImage)
    .filter(Boolean)
    .filter((image, index, all) => all.findIndex((candidate) => candidate.url === image.url) === index);
  const rawPrice =
    artwork.price === "" || artwork.price === undefined || artwork.price === null
      ? null
      : Number(artwork.price);
  const rawYear =
    artwork.year === "" || artwork.year === undefined || artwork.year === null
      ? null
      : Number(artwork.year);

  return {
    ...artwork,
    _id: String(id || ""),
    title: String(artwork.title || "").trim() || "Untitled",
    description: String(artwork.description || "").trim(),
    category: String(artwork.category || "").trim() || "Uncategorized",
    price: Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : null,
    medium: String(artwork.medium || "").trim(),
    dimensions: String(artwork.dimensions || "").trim(),
    year: Number.isFinite(rawYear) ? rawYear : null,
    images,
    isAvailable: isAvailable !== false,
    isFeatured: artwork.isFeatured ?? artwork.featured ?? false,
  };
};

const normalizeArtworksArray = (value) => {
  const byId = new Map();
  (Array.isArray(value) ? value : [])
    .map(normalizeArtwork)
    .filter((artwork) => artwork?._id)
    .forEach((artwork) => byId.set(artwork._id, artwork));
  return [...byId.values()];
};

const pickArtworks = (data) => {
  const payload = unwrap(data);
  return (
    payload?.artworks ||
    payload?.results ||
    payload?.items ||
    payload?.data?.artworks ||
    payload?.data?.results ||
    payload?.data ||
    []
  );
};

const pickPagination = (data, total) => {
  const payload = unwrap(data);
  return payload?.pagination || {
    total,
    page: 1,
    limit: total,
    pages: total > 0 ? 1 : 0,
  };
};

const normalizePortfolio = (data) => {
  const payload = unwrap(data);
  const artworks = normalizeArtworksArray(pickArtworks(payload));
  const categories = [...new Set([
    ...(Array.isArray(payload?.categories) ? payload.categories : []),
    ...artworks.map((artwork) => artwork.category || "Uncategorized"),
  ].filter(Boolean))].sort();

  return {
    ...emptyPortfolio,
    ...payload,
    settings: payload?.settings || null,
    profile: payload?.profile || null,
    about: payload?.about || null,
    artworks,
    categories,
  };
};

const loadFallbackPortfolio = async () => {
  if (!fallbackPortfolioPromise) {
    fallbackPortfolioPromise = fetch(`${STATIC_FALLBACK_URL}?_t=${Date.now()}`, {
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Static portfolio fallback failed: ${response.status}`);
        }
        return response.json();
      })
      .then(normalizePortfolio)
      .catch((error) => {
        fallbackPortfolioPromise = null;
        throw error;
      });
  }

  return fallbackPortfolioPromise;
};

const preferStaticData = async ({ loadStatic, loadLive, hasStaticData, onLiveData, label }) => {
  const livePromise = loadLive();
  // Attach a handler immediately so a fast live failure cannot become an
  // unhandled rejection while the static snapshot is being read.
  livePromise.catch(() => {});

  try {
    const staticData = await loadStatic();

    if (hasStaticData(staticData)) {
      livePromise
        .then((liveData) => onLiveData?.(liveData))
        .catch((error) => console.warn(`Live public ${label} refresh failed.`, error));
      return staticData;
    }
  } catch (error) {
    console.warn(`Static public ${label} could not be loaded.`, error);
  }

  const liveData = await livePromise;
  onLiveData?.(liveData);
  return liveData;
};

const matchesSearch = (artwork, search) => {
  if (!search) return true;
  const term = search.trim().toLowerCase();
  return [artwork.title, artwork.description, artwork.category, artwork.medium, artwork.collection, artwork.series, artwork.catalogueNumber]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
};

const filterArtworks = (artworks, params = {}) =>
  artworks.filter((artwork) => {
    if (["draft", "unpublished", "archived"].includes(artwork.publicationStatus)) return false;
    if (!matchesSearch(artwork, params.search)) return false;
    if (
      params.category &&
      params.category !== "all" &&
      artwork.category?.toLowerCase() !== params.category.toLowerCase()
    ) {
      return false;
    }
    if (params.available === "true" && !artwork.isAvailable) return false;
    if (params.available === "false" && artwork.isAvailable) return false;
    if (params.featured === "true" && !artwork.isFeatured) return false;
    if (params.collection && !String(artwork.collection || "").toLowerCase().includes(String(params.collection).toLowerCase())) return false;
    if (params.medium && !String(artwork.medium || "").toLowerCase().includes(String(params.medium).toLowerCase())) return false;
    if (params.year && Number(artwork.year) !== Number(params.year)) return false;
    if (params.decade && (Number(artwork.year) < Number(params.decade) || Number(artwork.year) > Number(params.decade) + 9)) return false;
    return true;
  });

const sortArtworks = (artworks, sort = "createdAt", order = "desc") => {
  const direction = order === "asc" ? 1 : -1;
  const sortKey = sort || "createdAt";

  return [...artworks].sort((a, b) => {
    const first = a?.[sortKey];
    const second = b?.[sortKey];

    if (sortKey === "price" || sortKey === "year") {
      const firstMissing = first === null || first === undefined || first === "";
      const secondMissing = second === null || second === undefined || second === "";
      if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;
      if (firstMissing) return 0;
      return (Number(first) - Number(second)) * direction;
    }

    if (sortKey === "isAvailable" || sortKey === "isFeatured") {
      return (Number(Boolean(first)) - Number(Boolean(second))) * direction;
    }

    if (sortKey === "createdAt" || sortKey === "updatedAt") {
      return (new Date(first || 0) - new Date(second || 0)) * direction;
    }

    return String(first || "").localeCompare(String(second || "")) * direction;
  });
};

const paginate = (items, page = 1, limit = 12) => {
  const currentPage = Number.parseInt(page, 10) || 1;
  const pageSize = Number.parseInt(limit, 10) || 12;
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

const getFallbackArtworks = async (params = {}) => {
  const portfolio = await loadFallbackPortfolio();
  const filtered = filterArtworks(portfolio.artworks, params);
  return {
    ...paginate(sortArtworks(filtered, params.sort, params.order), params.page, params.limit),
    source: "static",
    isStale: true,
    generatedAt: portfolio.generatedAt || null,
  };
};

const getLiveArtworks = async (params = {}) => {
  const key = artworkRequestKey(params);
  if (liveArtworkRequests.has(key)) return liveArtworkRequests.get(key);

  const controller = new AbortController();
  const abortTimer = window.setTimeout(() => controller.abort("Public artwork request timed out"), 4500);
  const request = api.get("/artworks", {
    params: withNoStoreParam(params),
    timeout: 4500,
    signal: controller.signal,
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  }).then((response) => {
    const payload = unwrap(response.data);
    const items = normalizeArtworksArray(pickArtworks(payload));
    clearArtworkRetry();
    return {
      items,
      pagination: pickPagination(payload, items.length),
      source: "live",
      isStale: false,
      generatedAt: payload?.generatedAt || new Date().toISOString(),
    };
  }).catch((error) => {
    scheduleArtworkRetry();
    throw error;
  }).finally(() => {
    window.clearTimeout(abortTimer);
    liveArtworkRequests.delete(key);
  });

  liveArtworkRequests.set(key, request);
  return request;
};

export const publicDataAPI = {
  getPortfolio: async ({ onLiveData } = {}) => {
    try {
      const live = await Promise.all([
        api.get("/settings", { params: withNoStoreParam() }).then((res) => unwrap(res.data)?.settings),
        api.get("/profile", { params: withNoStoreParam() }).then((res) => unwrap(res.data)?.profile),
        getLiveArtworks({ limit: 500 }).then((res) => res.items),
        api
          .get("/artworks/categories", { params: withNoStoreParam() })
          .then((res) => unwrap(res.data)?.categories || []),
      ]).then(([settings, profile, artworks, categories]) =>
        normalizePortfolio({
          generatedAt: new Date().toISOString(),
          settings,
          profile,
          artworks,
          categories,
        })
      );

      onLiveData?.(live);
      return live;
    } catch (error) {
      console.warn("Live public portfolio failed; using static fallback.", error);
      return loadFallbackPortfolio();
    }
  },

  getSettings: async ({ onLiveData } = {}) => {
    try {
      return await preferStaticData({
        loadStatic: () => loadFallbackPortfolio().then((portfolio) => portfolio.settings),
        loadLive: () => api
          .get("/settings", { params: withNoStoreParam() })
          .then((res) => unwrap(res.data)?.settings)
          .then((settings) => {
            if (!settings) throw new Error("Live settings response was invalid");
            return settings;
          }),
        hasStaticData: Boolean,
        onLiveData,
        label: "settings",
      });
    } catch (error) {
      console.warn("Live public settings failed; using static fallback.", error);
      const portfolio = await loadFallbackPortfolio();
      return portfolio.settings || null;
    }
  },

  getProfile: async ({ onLiveData } = {}) => {
    try {
      return await preferStaticData({
        loadStatic: () => loadFallbackPortfolio().then((portfolio) => portfolio.profile),
        loadLive: () => api
          .get("/profile", { params: withNoStoreParam() })
          .then((res) => unwrap(res.data)?.profile)
          .then((profile) => {
            if (!profile) throw new Error("Live profile response was invalid");
            return profile;
          }),
        hasStaticData: Boolean,
        onLiveData,
        label: "profile",
      });
    } catch (error) {
      console.warn("Live public profile failed; using static fallback.", error);
      const portfolio = await loadFallbackPortfolio();
      return portfolio.profile || null;
    }
  },

  getAbout: async ({ onLiveData } = {}) => {
    try {
      return await preferStaticData({
        loadStatic: () => loadFallbackPortfolio().then((portfolio) => portfolio.about),
        loadLive: () => api
          .get("/about", { params: withNoStoreParam() })
          .then((res) => unwrap(res.data)?.about)
          .then((about) => {
            if (!about) throw new Error("Live About page response was not published");
            return about;
          }),
        hasStaticData: Boolean,
        onLiveData,
        label: "About page",
      });
    } catch (error) {
      console.warn("Live public About page failed; using static fallback.", error);
      const portfolio = await loadFallbackPortfolio();
      return portfolio.about || null;
    }
  },

  getArtworks: async (params = {}, { onLiveData } = {}) => {
    const livePromise = getLiveArtworks(params);
    livePromise.catch(() => {});

    try {
      const staticData = await getFallbackArtworks(params);
      if (staticData.items.length > 0) {
        livePromise
          .then((liveData) => onLiveData?.(liveData))
          .catch((error) => console.warn("Live public artworks refresh failed.", error));
        return staticData;
      }

      const liveData = await livePromise;
      onLiveData?.(liveData);
      return liveData;
    } catch (error) {
      try {
        const staticData = await getFallbackArtworks(params);
        console.warn("Live public artworks failed; using static fallback.", error);
        if (staticData.items.length > 0) return staticData;
        throw error;
      } catch (fallbackError) {
        console.warn("Both live and static public artworks failed.", fallbackError);
        throw error;
      }
    }
  },

  getArtworkById: async (id, { onLiveData } = {}) => {
    try {
      return await preferStaticData({
        loadStatic: () => loadFallbackPortfolio().then(
          (portfolio) => portfolio.artworks.find(
            (artwork) => artwork._id === id || artwork.slug === id
          ) || null
        ),
        loadLive: () => api
          .get(`/artworks/${id}`, { params: withNoStoreParam() })
          .then((res) => normalizeArtwork(unwrap(res.data)?.artwork))
          .then((item) => {
            if (!item) throw new Error("Live artwork response was invalid");
            return item;
          }),
        hasStaticData: Boolean,
        onLiveData,
        label: "artwork detail",
      });
    } catch (error) {
      if (error.response?.status === 404) return null;
      console.warn("Live public artwork detail failed; using static fallback.", error);
      const portfolio = await loadFallbackPortfolio();
      return portfolio.artworks.find((artwork) => artwork._id === id || artwork.slug === id) || null;
    }
  },

  getArtworkNeighbors: async (id) => api
    .get(`/artworks/${encodeURIComponent(id)}/neighbors`, { params: withNoStoreParam(), timeout: 4500 })
    .then((response) => ({
      previous: normalizeArtwork(unwrap(response.data)?.previous),
      next: normalizeArtwork(unwrap(response.data)?.next),
    })),

  getCategories: async ({ onLiveData } = {}) => {
    try {
      return await preferStaticData({
        loadStatic: () => loadFallbackPortfolio().then((portfolio) => portfolio.categories),
        loadLive: () => api
          .get("/artworks/categories", { params: withNoStoreParam() })
          .then((res) => unwrap(res.data)?.categories || [])
          .then((items) => items.filter(Boolean).sort()),
        hasStaticData: (categories) => categories.length > 0,
        onLiveData,
        label: "categories",
      });
    } catch (error) {
      console.warn("Live public categories failed; using static fallback.", error);
      const portfolio = await loadFallbackPortfolio();
      return portfolio.categories;
    }
  },
};
