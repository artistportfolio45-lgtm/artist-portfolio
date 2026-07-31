import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { publicDataAPI } from "../../services/publicData";

const DEFAULT_SORT = "createdAt-desc";
const SKELETON_RATIOS = ["4 / 5", "1 / 1", "3 / 4", "5 / 4", "2 / 3", "4 / 3"];

const responsiveImage = (url, width) => {
  if (!url?.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/f_auto,q_auto,c_limit,w_${width}/`);
};

const GalleryTile = ({ artwork, priority = false }) => {
  const image = artwork.images?.[0];
  const title = artwork.title || "Untitled";

  return (
    <article className="gallery-masonry-item">
      <Link
        to={`/artwork/${artwork._id}`}
        aria-label={`View ${title}`}
        className="gallery-artwork-link group block bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        <span className="gallery-artwork-media relative block overflow-hidden">
          {image?.url ? (
            <img
              src={responsiveImage(image.url, 1000)}
              srcSet={`${responsiveImage(image.url, 600)} 600w, ${responsiveImage(image.url, 1000)} 1000w, ${responsiveImage(image.url, 1400)} 1400w`}
              sizes="(min-width: 1680px) 25vw, (min-width: 1024px) 33.3vw, (min-width: 640px) 50vw, 100vw"
              width={image.width || undefined}
              height={image.height || undefined}
              alt={title}
              className="gallery-artwork-image block h-auto w-full"
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
            />
          ) : (
            <span className="flex aspect-[4/5] items-center justify-center text-sm text-slate/45">
              Image unavailable
            </span>
          )}
          <span className="gallery-artwork-overlay pointer-events-none absolute inset-0 flex items-end bg-black/0 p-4 text-left opacity-0 group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
            <span>
              <span className="block font-display text-lg font-light leading-tight text-white">{title}</span>
              {artwork.category && artwork.category !== "Uncategorized" && (
                <span className="mt-1 block text-[9px] font-label uppercase tracking-[0.18em] text-white/75">
                  {artwork.category}
                </span>
              )}
              <span className="mt-2 block text-[9px] font-label uppercase tracking-[0.16em] text-white/90">
                View artwork
              </span>
            </span>
          </span>
        </span>
        <span className="gallery-mobile-caption">
          <span className="min-w-0 truncate">{title}</span>
          {artwork.year && <span className="flex-shrink-0 text-slate/45">{artwork.year}</span>}
        </span>
      </Link>
    </article>
  );
};

const GallerySkeleton = () => (
  <div role="status" aria-label="Loading artworks">
    <div className="gallery-masonry" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <div
          key={index}
          className="gallery-masonry-item gallery-skeleton"
          style={{ aspectRatio: SKELETON_RATIOS[index % SKELETON_RATIOS.length] }}
        />
      ))}
    </div>
    <span className="sr-only">Loading artworks...</span>
  </div>
);

const GalleryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [artworks, setArtworks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState(() => searchParams.get("category") || "all");
  const [availability, setAvailability] = useState(
    () => searchParams.get("availability") || "all"
  );
  const [sortValue, setSortValue] = useState(() => searchParams.get("sort") || DEFAULT_SORT);
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [page, setPage] = useState(1);

  const applyResult = useCallback((result, requestedPage) => {
    const incoming = result.items || [];
    setArtworks((current) => {
      if (requestedPage === 1) return incoming;
      const byId = new Map([...current, ...incoming].map((artwork) => [artwork._id, artwork]));
      return [...byId.values()];
    });
    setPagination(result.pagination || {});
  }, []);

  const fetchArtworks = useCallback(async () => {
    page === 1 ? setLoading(true) : setLoadingMore(true);
    setError("");
    const [sort, order] = sortValue.split("-");

    try {
      const params = { page, limit: 36, sort, order };
      if (category !== "all") params.category = category;
      if (availability !== "all") params.available = availability;
      if (search) params.search = search;

      const result = await publicDataAPI.getArtworks(params, {
        onLiveData: (liveResult) => applyResult(liveResult, page),
      });
      applyResult(result, page);
    } catch {
      setError("The gallery could not be loaded. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [applyResult, availability, category, page, search, sortValue]);

  useEffect(() => {
    publicDataAPI.getCategories({ onLiveData: setCategories })
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    fetchArtworks();
  }, [fetchArtworks]);

  const galleryCategories = useMemo(() => {
    const seen = new Set();
    const preferredOrder = new Map([
      ["original art", 0],
      ["client work", 1],
    ]);

    const dynamicCategories = categories.filter((item) => {
      const key = String(item || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    dynamicCategories.sort((first, second) => {
      const firstRank = preferredOrder.get(String(first).toLowerCase()) ?? 2;
      const secondRank = preferredOrder.get(String(second).toLowerCase()) ?? 2;
      return firstRank - secondRank || String(first).localeCompare(String(second));
    });

    return ["all", ...dynamicCategories];
  }, [categories]);

  const updateCollection = (changes = {}) => {
    const nextCategory = changes.category ?? category;
    const nextAvailability = changes.availability ?? availability;
    const nextSort = changes.sortValue ?? sortValue;
    const nextSearch = changes.search ?? search;

    setPage(1);
    setArtworks([]);
    setCategory(nextCategory);
    setAvailability(nextAvailability);
    setSortValue(nextSort);
    setSearch(nextSearch);

    const nextParams = new URLSearchParams();
    if (nextCategory !== "all") nextParams.set("category", nextCategory);
    if (nextAvailability !== "all") nextParams.set("availability", nextAvailability);
    if (nextSort !== DEFAULT_SORT) nextParams.set("sort", nextSort);
    if (nextSearch) nextParams.set("q", nextSearch);
    setSearchParams(nextParams, { replace: true });
  };

  const clearFilters = () => {
    setSearchInput("");
    updateCollection({ category: "all", availability: "all", search: "" });
  };

  const hasActiveFilters =
    category !== "all" || availability !== "all" || Boolean(search);
  const resultCount = pagination.total ?? artworks.length;

  return (
    <PublicLayout>
      <div className="min-h-screen bg-white pt-16 md:pt-20">
        <header className="container-site pb-6 pt-8 md:pb-8 md:pt-12">
          <div>
            <p className="eyebrow mb-2">Portfolio</p>
            <h1 className="font-display text-4xl font-light leading-none text-charcoal md:text-5xl">
              Gallery
            </h1>
            <p className="mt-3 max-w-xl text-sm font-light leading-relaxed text-slate/60">
              Explore the complete collection of original works and selected projects.
            </p>
          </div>

          <nav className="gallery-category-nav mt-7 overflow-x-auto" aria-label="Artwork categories">
            <div className="flex min-w-max gap-7 border-b border-charcoal/10">
                {galleryCategories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => updateCollection({ category: item })}
                    aria-pressed={category === item}
                    className={`-mb-px border-b py-3 text-[11px] font-label uppercase tracking-[0.16em] transition-colors duration-300 ${
                      category === item
                        ? "border-charcoal text-charcoal"
                        : "border-transparent text-slate/45 hover:text-charcoal"
                    }`}
                  >
                    {item === "all" ? "All" : item}
                  </button>
                ))}
            </div>
          </nav>

          <div className="mt-4 border-b border-charcoal/10 pb-5">
            <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(0,auto)] md:items-center">
            <form
              className="flex w-full md:max-w-md"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const nextSearch = searchInput.trim();
                setSearchInput(nextSearch);
                updateCollection({ search: nextSearch });
              }}
            >
              <label htmlFor="gallery-search" className="sr-only">Search artworks</label>
              <input
                id="gallery-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="h-11 min-w-0 flex-1 border border-charcoal/15 bg-transparent px-3 text-sm text-charcoal placeholder:text-slate/35 focus:border-gold focus:outline-none"
                placeholder="Search artworks"
              />
              <button
                type="submit"
                className="h-11 flex-shrink-0 border border-l-0 border-charcoal/15 px-4 text-[10px] font-label uppercase tracking-[0.14em] text-charcoal transition-colors hover:border-charcoal hover:bg-charcoal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                Search
              </button>
            </form>

            <div className="grid grid-cols-2 gap-3 md:flex md:justify-end">
              <label className="min-w-0">
                <span className="sr-only">Availability</span>
                <select
                  value={availability}
                  onChange={(event) => updateCollection({ availability: event.target.value })}
                  className="h-11 w-full border border-charcoal/15 bg-transparent px-3 text-sm text-charcoal focus:border-gold focus:outline-none md:w-auto"
                >
                  <option value="all">All availability</option>
                  <option value="true">Available</option>
                  <option value="false">Not available</option>
                </select>
              </label>
              <label className="min-w-0">
                <span className="sr-only">Sort artworks</span>
                <select
                  value={sortValue}
                  onChange={(event) => updateCollection({ sortValue: event.target.value })}
                  className="h-11 w-full border border-charcoal/15 bg-transparent px-3 text-sm text-charcoal focus:border-gold focus:outline-none md:w-auto"
                >
                  <option value="createdAt-desc">Newest</option>
                  <option value="createdAt-asc">Oldest</option>
                  <option value="title-asc">Title A–Z</option>
                  <option value="price-asc">Price low–high</option>
                  <option value="price-desc">Price high–low</option>
                </select>
              </label>
            </div>
            </div>

            <div className="mt-3 flex min-h-6 items-center justify-between gap-4 text-xs text-slate/50">
              <p aria-live="polite">
                {loading ? "Loading collection..." : `${resultCount} ${resultCount === 1 ? "artwork" : "artworks"}`}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-11 px-1 text-charcoal underline decoration-gold/70 underline-offset-4 transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="gallery-results mx-auto max-w-[1920px] px-4 pb-8 sm:px-6 lg:px-8" aria-live="polite">
          {loading ? (
            <GallerySkeleton />
          ) : error ? (
            <div className="mx-auto my-16 max-w-xl px-6 py-12 text-center">
              <p className="font-display text-3xl">Gallery unavailable</p>
              <p className="mt-3 text-sm text-slate/60">{error}</p>
              <button type="button" onClick={fetchArtworks} className="btn-secondary mt-6">Retry</button>
            </div>
          ) : artworks.length === 0 ? (
            <div className="mx-auto my-16 max-w-xl px-6 py-12 text-center">
              <p className="font-display text-3xl">No artworks found</p>
              <p className="mt-3 text-sm text-slate/60">Try adjusting the search or filters.</p>
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters} className="btn-secondary mt-6">
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="gallery-masonry">
              {artworks.map((artwork, index) => (
                <GalleryTile key={artwork._id} artwork={artwork} priority={index < 6} />
              ))}
            </div>
          )}

          {page < (pagination.pages || 0) && !loading && (
            <div className="flex justify-center py-10">
              <button
                type="button"
                onClick={() => setPage((value) => value + 1)}
                disabled={loadingMore}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
              >
                {loadingMore && <LoadingSpinner size="sm" />} Load More
              </button>
            </div>
          )}
        </section>
      </div>
    </PublicLayout>
  );
};

export default GalleryPage;
