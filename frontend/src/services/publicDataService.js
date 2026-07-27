import api from "./api";

const STATIC_FALLBACK_URL = "/data/portfolio.json";

const emptyPortfolio = {
  generatedAt: null,
  settings: null,
  profile: null,
  artworks: [],
  categories: [],
};

let fallbackPortfolioPromise = null;

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
    .filter(Boolean);

  return {
    ...artwork,
    _id: String(id || ""),
    images,
    isAvailable,
    isFeatured: artwork.isFeatured ?? artwork.featured ?? false,
  };
};

const normalizeArtworksArray = (value) =>
  (Array.isArray(value) ? value : []).map(normalizeArtwork).filter((artwork) => artwork?._id);

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
  const categories = Array.isArray(payload?.categories)
    ? payload.categories.filter(Boolean).sort()
    : [...new Set(artworks.map((artwork) => artwork.category).filter(Boolean))].sort();

  return {
    ...emptyPortfolio,
    ...payload,
    settings: payload?.settings || null,
    profile: payload?.profile || null,
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
      .finally(() => {
        fallbackPortfolioPromise = null;
      });
  }

  return fallbackPortfolioPromise;
};

const matchesSearch = (artwork, search) => {
  if (!search) return true;
  const term = search.trim().toLowerCase();
  return [artwork.title, artwork.description, artwork.category, artwork.medium]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
};

const filterArtworks = (artworks, params = {}) =>
  artworks.filter((artwork) => {
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
    return true;
  });

const sortArtworks = (artworks, sort = "createdAt", order = "desc") => {
  const direction = order === "asc" ? 1 : -1;
  const sortKey = sort || "createdAt";

  return [...artworks].sort((a, b) => {
    const first = a?.[sortKey];
    const second = b?.[sortKey];

    if (sortKey === "price" || sortKey === "year") {
      return ((Number(first) || 0) - (Number(second) || 0)) * direction;
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
  return paginate(sortArtworks(filtered, params.sort, params.order), params.page, params.limit);
};

const getLiveArtworks = async (params = {}) => {
  const response = await api.get("/artworks", { params: withNoStoreParam(params) });
  const payload = unwrap(response.data);
  const items = normalizeArtworksArray(pickArtworks(payload));

  if (items.length === 0) {
    throw new Error("Live artwork response was empty");
  }

  return {
    items,
    pagination: pickPagination(payload, items.length),
  };
};

const liveUpdate = (promise, onLiveData) => {
  promise.then((data) => {
    if (typeof onLiveData === "function") onLiveData(data);
  }).catch((error) => {
    console.warn("Live public data update failed; keeping static data.", error);
  });
};

export const publicDataAPI = {
  getPortfolio: async ({ onLiveData } = {}) => {
    const fallback = await loadFallbackPortfolio();
    const livePromise = Promise.all([
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

    liveUpdate(livePromise, (live) => {
      if (live.artworks.length > 0) onLiveData(live);
    });

    if (fallback.artworks.length > 0) return fallback;
    return livePromise.catch(() => fallback);
  },

  getSettings: async ({ onLiveData } = {}) => {
    const portfolio = await loadFallbackPortfolio();
    const livePromise = api
      .get("/settings", { params: withNoStoreParam() })
      .then((res) => unwrap(res.data)?.settings)
      .then((settings) => {
        if (!settings) throw new Error("Live settings response was invalid");
        return settings;
      });

    liveUpdate(livePromise, onLiveData);
    return portfolio.settings || livePromise.catch(() => null);
  },

  getProfile: async ({ onLiveData } = {}) => {
    const portfolio = await loadFallbackPortfolio();
    const livePromise = api
      .get("/profile", { params: withNoStoreParam() })
      .then((res) => unwrap(res.data)?.profile)
      .then((profile) => {
        if (!profile) throw new Error("Live profile response was invalid");
        return profile;
      });

    liveUpdate(livePromise, onLiveData);
    return portfolio.profile || livePromise.catch(() => null);
  },

  getArtworks: async (params = {}, { onLiveData } = {}) => {
    const fallback = await getFallbackArtworks(params);
    const livePromise = getLiveArtworks(params);

    liveUpdate(livePromise, onLiveData);
    if (fallback.items.length > 0) return fallback;
    return livePromise.catch(() => fallback);
  },

  getArtworkById: async (id, { onLiveData } = {}) => {
    const portfolio = await loadFallbackPortfolio();
    const fallback =
      portfolio.artworks.find((artwork) => artwork._id === id || artwork.slug === id) || null;

    const livePromise = api
      .get(`/artworks/${id}`, { params: withNoStoreParam() })
      .then((res) => normalizeArtwork(unwrap(res.data)?.artwork));

    liveUpdate(livePromise, (item) => {
      if (item) onLiveData?.(item);
    });

    if (fallback) return fallback;
    return livePromise.catch(() => null);
  },

  getCategories: async ({ onLiveData } = {}) => {
    const portfolio = await loadFallbackPortfolio();
    const livePromise = api
      .get("/artworks/categories", { params: withNoStoreParam() })
      .then((res) => unwrap(res.data)?.categories || [])
      .then((categories) => categories.filter(Boolean).sort());

    liveUpdate(livePromise, onLiveData);
    return portfolio.categories.length > 0 ? portfolio.categories : livePromise.catch(() => []);
  },
};
