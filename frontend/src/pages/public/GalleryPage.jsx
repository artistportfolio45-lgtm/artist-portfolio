import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import ArtworkMasonry from "../../components/public/ArtworkMasonry";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { publicDataAPI } from "../../services/publicData";

const DEFAULT_SORT = "createdAt-desc";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    return ["all", ...categories].filter((item) => {
      const key = String(item || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

  const availabilitySelect = (
    <label className="block">
      <span className="sr-only">Availability</span>
      <select
        value={availability}
        onChange={(event) => updateCollection({ availability: event.target.value })}
        className="h-11 w-full border border-charcoal/15 bg-transparent px-3 text-sm text-charcoal focus:border-gold focus:outline-none"
      >
        <option value="all">All availability</option>
        <option value="true">Available</option>
        <option value="false">Not available</option>
      </select>
    </label>
  );

  const sortSelect = (
    <label className="block">
      <span className="sr-only">Sort artworks</span>
      <select
        value={sortValue}
        onChange={(event) => updateCollection({ sortValue: event.target.value })}
        className="h-11 w-full border border-charcoal/15 bg-transparent px-3 text-sm text-charcoal focus:border-gold focus:outline-none"
      >
        <option value="createdAt-desc">Newest</option>
        <option value="createdAt-asc">Oldest</option>
        <option value="title-asc">Title A–Z</option>
        <option value="price-asc">Price low–high</option>
        <option value="price-desc">Price high–low</option>
      </select>
    </label>
  );

  return (
    <PublicLayout>
      <div className="min-h-screen bg-white pt-16 md:pt-20 lg:pt-0">
        <header className="mx-auto max-w-[1920px] px-4 pb-4 pt-6 sm:px-6 lg:px-6 lg:pt-5">
          <p className="eyebrow mb-1.5">Portfolio</p>
          <h1 className="font-display text-3xl font-light leading-none text-charcoal md:text-4xl">
            Gallery
          </h1>

          <nav className="gallery-category-nav mt-4 overflow-x-auto" aria-label="Artwork categories">
            <div className="flex min-w-max gap-7 border-b border-charcoal/10">
              {galleryCategories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => updateCollection({ category: item })}
                  aria-pressed={category === item}
                  className={`-mb-px min-h-11 border-b text-[11px] font-label uppercase tracking-[0.14em] transition-colors ${
                    category === item
                      ? "border-gold text-charcoal"
                      : "border-transparent text-slate/45 hover:text-charcoal"
                  }`}
                >
                  {item === "all" ? "All" : item}
                </button>
              ))}
            </div>
          </nav>

          <div className="mt-3 border-b border-charcoal/10 pb-3">
            <div className="flex items-center gap-2">
              <form
                className="flex w-0 min-w-0 flex-1 lg:w-full lg:max-w-sm"
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
                  className="h-11 flex-shrink-0 border border-l-0 border-charcoal/15 px-2 text-[10px] font-label uppercase tracking-[0.08em] text-charcoal transition-colors hover:bg-charcoal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold sm:px-3 sm:tracking-[0.12em]"
                >
                  Search
                </button>
              </form>

              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                className="h-11 flex-shrink-0 border border-charcoal/15 px-3 text-sm text-charcoal lg:hidden"
                aria-expanded={filtersOpen}
                aria-controls="gallery-mobile-filters"
              >
                Filters
              </button>

              <div className="ml-auto hidden grid-cols-2 gap-2 lg:grid">
                {availabilitySelect}
                {sortSelect}
              </div>
            </div>

            <div
              id="gallery-mobile-filters"
              className={`grid grid-cols-1 gap-2 overflow-hidden transition-all lg:hidden ${
                filtersOpen ? "mt-3 max-h-32 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {availabilitySelect}
              {sortSelect}
            </div>

            <div className="mt-2 flex min-h-7 items-center justify-between gap-4 text-xs text-slate/50">
              <p aria-live="polite">
                {loading
                  ? "Loading collection..."
                  : `${resultCount} ${resultCount === 1 ? "artwork" : "artworks"}`}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-11 px-1 text-charcoal underline decoration-gold/70 underline-offset-4 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </header>

        <section
          className="gallery-results mx-auto max-w-[1920px] px-4 pb-8 sm:px-6 lg:px-6"
          aria-live="polite"
        >
          {error && !loading ? (
            <div className="mx-auto my-16 max-w-xl px-6 py-12 text-center">
              <p className="font-display text-3xl">Gallery unavailable</p>
              <p className="mt-3 text-sm text-slate/60">{error}</p>
              <button type="button" onClick={fetchArtworks} className="btn-secondary mt-6">
                Retry
              </button>
            </div>
          ) : (
            <ArtworkMasonry
              artworks={artworks}
              loading={loading}
              priorityCount={6}
              emptyState={
                <div className="mx-auto my-16 max-w-xl px-6 py-12 text-center">
                  <p className="font-display text-3xl">No artworks found</p>
                  <p className="mt-3 text-sm text-slate/60">Try adjusting the search or filters.</p>
                  {hasActiveFilters && (
                    <button type="button" onClick={clearFilters} className="btn-secondary mt-6">
                      Clear Filters
                    </button>
                  )}
                </div>
              }
            />
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
