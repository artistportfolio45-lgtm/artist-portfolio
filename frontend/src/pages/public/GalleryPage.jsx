import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigationType, useSearchParams } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import ArtworkMasonry from "../../components/public/ArtworkMasonry";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { publicDataAPI } from "../../services/publicData";
import { subscribeToArtworkRefresh } from "../../services/artworkRefresh";
import CachedDataNotice from "../../components/public/CachedDataNotice";
import { clearGalleryRestoreState, galleryRestoreTargetY, normalizeGalleryPage, readGalleryRestoreState } from "../../utils/galleryRestore";

const DEFAULT_SORT = "createdAt-desc";
const GALLERY_PAGE_SIZE = 50;
const GALLERY_RESTORE_ANCHOR_SELECTOR = "[data-gallery-artwork-id]";

const GalleryPage = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  const [artworks, setArtworks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState(() => searchParams.get("category") || "all");
  const [availability, setAvailability] = useState(
    () => searchParams.get("availability") || "all"
  );
  const [sortValue, setSortValue] = useState(() => searchParams.get("sort") || DEFAULT_SORT);
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [collection, setCollection] = useState(() => searchParams.get("collection") || "");
  const [medium, setMedium] = useState(() => searchParams.get("medium") || "");
  const [year, setYear] = useState(() => searchParams.get("year") || "");
  const [decade, setDecade] = useState(() => searchParams.get("decade") || "");
  const [page, setPage] = useState(() => normalizeGalleryPage(searchParams.get("page"), 1));
  const restoreState = useMemo(() => ({
    pathname: location.pathname,
    search: location.search,
    page,
    scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    filters: {
      category,
      availability,
      sort: sortValue,
      search,
      collection,
      medium,
      year,
      decade,
    },
  }), [availability, category, collection, decade, location.pathname, location.search, medium, page, search, sortValue, year]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dataSource, setDataSource] = useState("loading");
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const gridRef = useRef(null);
  const restoreRequestedRef = useRef(false);
  const restorePendingRef = useRef(false);
  const restoreFrameRef = useRef(null);
  const activeArtworkIdRef = useRef("");

  const applyResult = useCallback((result, requestedPage) => {
    if (!mountedRef.current) return;
    const incoming = result.items || [];
    setArtworks(incoming);
    setPagination(result.pagination || {});
    setDataSource(result.isStale ? "static" : "live");
    if (requestedPage > 1 && incoming.length === 0) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, []);

  const fetchArtworks = useCallback(async (requestedPage = page) => {
    const requestId = ++requestIdRef.current;
    let liveApplied = false;
    requestedPage === 1 ? setLoading(true) : setLoadingPage(true);
    setError("");
    const [sort, order] = sortValue.split("-");

    try {
      const params = { page: requestedPage, limit: GALLERY_PAGE_SIZE, sort, order };
      if (category !== "all") params.category = category;
      if (availability !== "all") params.available = availability;
      if (search) params.search = search;
      if (collection) params.collection = collection;
      if (medium) params.medium = medium;
      if (year) params.year = year;
      if (decade && !year) params.decade = decade;

      const result = await publicDataAPI.getArtworks(params, {
        onLiveData: (liveResult) => {
          liveApplied = true;
          if (requestId === requestIdRef.current) applyResult(liveResult, requestedPage);
        },
      });
      if (requestId !== requestIdRef.current) return;
      if (!liveApplied || result.source === "live") applyResult(result, requestedPage);
    } catch {
      setError("The gallery could not be loaded. Please try again.");
    } finally {
      setLoading(false);
      setLoadingPage(false);
    }
  }, [applyResult, availability, category, collection, decade, medium, page, search, sortValue, year]);

  useEffect(() => {
    publicDataAPI.getCategories({ onLiveData: setCategories })
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const nextPage = normalizeGalleryPage(searchParams.get("page"), 1);
    const nextCategory = searchParams.get("category") || "all";
    const nextAvailability = searchParams.get("availability") || "all";
    const nextSort = searchParams.get("sort") || DEFAULT_SORT;
    const nextSearch = searchParams.get("q") || "";
    const nextCollection = searchParams.get("collection") || "";
    const nextMedium = searchParams.get("medium") || "";
    const nextYear = searchParams.get("year") || "";
    const nextDecade = searchParams.get("decade") || "";

    setPage(nextPage);
    setCategory(nextCategory);
    setAvailability(nextAvailability);
    setSortValue(nextSort);
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setCollection(nextCollection);
    setMedium(nextMedium);
    setYear(nextYear);
    setDecade(nextDecade);
  }, [searchParams]);

  useEffect(() => {
    fetchArtworks(page);
    return subscribeToArtworkRefresh(() => fetchArtworks(page));
  }, [fetchArtworks, page]);

  useEffect(() => () => {
    mountedRef.current = false;
    requestIdRef.current += 1;
  }, []);

  const galleryCategories = useMemo(() => {
    const seen = new Set();
    return ["all", ...categories].filter((item) => {
      const key = String(item || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [categories]);

  const updateCollection = (changes = {}, nextPage = 1) => {
    const nextCategory = changes.category ?? category;
    const nextAvailability = changes.availability ?? availability;
    const nextSort = changes.sortValue ?? sortValue;
    const nextSearch = changes.search ?? search;
    const nextCollection = changes.collection ?? collection;
    const nextMedium = changes.medium ?? medium;
    const nextYear = changes.year ?? year;
    const nextDecade = changes.decade ?? decade;

    setPage(nextPage);
    setArtworks([]);
    setCategory(nextCategory);
    setAvailability(nextAvailability);
    setSortValue(nextSort);
    setSearch(nextSearch);
    setCollection(nextCollection);
    setMedium(nextMedium);
    setYear(nextYear);
    setDecade(nextDecade);

    const nextParams = new URLSearchParams();
    if (nextPage > 1) nextParams.set("page", String(nextPage));
    if (nextCategory !== "all") nextParams.set("category", nextCategory);
    if (nextAvailability !== "all") nextParams.set("availability", nextAvailability);
    if (nextSort !== DEFAULT_SORT) nextParams.set("sort", nextSort);
    if (nextSearch) nextParams.set("q", nextSearch);
    if (nextCollection) nextParams.set("collection", nextCollection);
    if (nextMedium) nextParams.set("medium", nextMedium);
    if (nextYear) nextParams.set("year", nextYear);
    if (nextDecade && !nextYear) nextParams.set("decade", nextDecade);
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    const normalized = searchInput.trim();
    if (normalized === search) return undefined;
    const timeout = window.setTimeout(() => updateCollection({ search: normalized }), 350);
    return () => window.clearTimeout(timeout);
  // updateCollection intentionally reads the latest controlled filter state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search]);

  const clearFilters = () => {
    setSearchInput("");
    updateCollection({ category: "all", availability: "all", search: "", collection: "", medium: "", year: "", decade: "" }, 1);
  };

  const hasActiveFilters =
    category !== "all" || availability !== "all" || Boolean(search || collection || medium || year || decade);
  const resultCount = pagination.total ?? artworks.length;
  const totalPages = Math.max(1, Number(pagination.pages) || 1);
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const scrollGalleryToStart = useCallback(() => {
    const top = gridRef.current?.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion ? "auto" : "smooth", left: 0 });
  }, [prefersReducedMotion]);

  const goToPage = useCallback((nextPage) => {
    const safePage = Math.min(Math.max(1, Number(nextPage) || 1), totalPages);
    if (safePage === page || loadingPage) return;

    setLoadingPage(true);
    setPage(safePage);
    const nextParams = new URLSearchParams(searchParams);
    if (safePage > 1) nextParams.set("page", String(safePage)); else nextParams.delete("page");
    if (category !== "all") nextParams.set("category", category);
    if (availability !== "all") nextParams.set("availability", availability);
    if (sortValue !== DEFAULT_SORT) nextParams.set("sort", sortValue);
    if (search) nextParams.set("q", search);
    if (collection) nextParams.set("collection", collection);
    if (medium) nextParams.set("medium", medium);
    if (year) nextParams.set("year", year);
    if (decade && !year) nextParams.set("decade", decade);
    setSearchParams(nextParams, { replace: false });
    requestAnimationFrame(() => scrollGalleryToStart());
  }, [availability, category, collection, decade, loadingPage, medium, page, prefersReducedMotion, search, searchParams, setSearchParams, sortValue, totalPages, year, scrollGalleryToStart]);

  useEffect(() => {
    const restoreState = readGalleryRestoreState();
    if (!restoreState || restoreRequestedRef.current) return;

    if (navigationType !== "POP") {
      clearGalleryRestoreState();
      return;
    }

    const currentPath = `${location.pathname}${location.search}`;
    const restorePath = `${restoreState.pathname}${restoreState.search || ""}`;
    if (currentPath !== restorePath) return;

    const normalizedPage = normalizeGalleryPage(restoreState.page, 1);
    const restoredPage = Math.min(normalizedPage, totalPages);
    const restoreSearch = restoreState.filters?.search || "";
    const restoreCategory = restoreState.filters?.category || "all";
    const restoreAvailability = restoreState.filters?.availability || "all";
    const restoreSort = restoreState.filters?.sort || DEFAULT_SORT;

    if (restoreState.artworkId) activeArtworkIdRef.current = restoreState.artworkId;
    if (restoredPage !== page) {
      setPage(restoredPage);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (restoredPage > 1) next.set("page", String(restoredPage)); else next.delete("page");
        if (restoreCategory !== "all") next.set("category", restoreCategory);
        if (restoreAvailability !== "all") next.set("availability", restoreAvailability);
        if (restoreSort !== DEFAULT_SORT) next.set("sort", restoreSort);
        if (restoreSearch) next.set("q", restoreSearch);
        return next;
      }, { replace: true });
    }

    restoreRequestedRef.current = true;
  }, [location.pathname, location.search, navigationType, page, setSearchParams, totalPages]);

  useEffect(() => {
    if (!gridRef.current || !restoreRequestedRef.current || !activeArtworkIdRef.current) return;
    if (restorePendingRef.current) return;
    restorePendingRef.current = true;
    const anchor = gridRef.current.querySelector(`${GALLERY_RESTORE_ANCHOR_SELECTOR}[data-gallery-artwork-id="${activeArtworkIdRef.current}"]`);
    if (!anchor) {
      requestAnimationFrame(() => {
        restorePendingRef.current = false;
        const fallback = gridRef.current?.querySelector(GALLERY_RESTORE_ANCHOR_SELECTOR);
        if (fallback) {
          fallback.scrollIntoView({ block: "start" });
        }
      });
      return;
    }

    const restorePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const saved = readGalleryRestoreState();
      const targetY = galleryRestoreTargetY({
        savedScrollY: saved?.scrollY,
        savedAnchorOffset: saved?.anchorOffset,
        currentScrollY: window.scrollY,
        currentAnchorOffset: rect.top,
      });
      window.scrollTo({ top: targetY, behavior: "auto", left: 0 });
      restorePendingRef.current = false;
      clearGalleryRestoreState();
    };

    requestAnimationFrame(() => restorePosition());
  }, [artworks, page]);

  useEffect(() => {
    if (pagination.pages && page > pagination.pages) {
      const safePage = Math.max(1, Number(pagination.pages) || 1);
      setPage(safePage);
      const nextParams = new URLSearchParams(searchParams);
      if (safePage > 1) nextParams.set("page", String(safePage)); else nextParams.delete("page");
      setSearchParams(nextParams, { replace: true });
    }
  }, [page, pagination.pages, searchParams, setSearchParams]);

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
        <option value="title-desc">Title Z–A</option>
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
                className="h-11 flex-shrink-0 border border-charcoal/15 px-3 text-sm text-charcoal"
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
              className={`grid grid-cols-1 gap-2 overflow-hidden transition-all sm:grid-cols-2 lg:grid-cols-5 ${
                filtersOpen ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {availabilitySelect}
              {sortSelect}
              {[["collection", collection, setCollection], ["medium", medium, setMedium], ["year", year, setYear], ["decade", decade, setDecade]].map(([key, value, setter]) => (
                <label key={key} className="block">
                  <span className="sr-only">Filter by {key}</span>
                  <input
                    type={key === "year" ? "number" : "text"}
                    value={value}
                    onChange={(event) => setter(event.target.value)}
                    onBlur={() => updateCollection({ collection, medium, year, decade })}
                    onKeyDown={(event) => { if (event.key === "Enter") updateCollection({ collection, medium, year, decade }); }}
                    className="h-11 w-full border border-charcoal/15 bg-transparent px-3 text-sm text-charcoal focus:border-gold focus:outline-none"
                    placeholder={key[0].toUpperCase() + key.slice(1)}
                  />
                </label>
              ))}
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
          ref={gridRef}
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
              galleryRestoreState={restoreState}
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

          {totalPages > 1 && !loading && (
            <nav className="mt-8 flex flex-col gap-4 border-t border-charcoal/10 pt-6 sm:flex-row sm:items-center sm:justify-between" aria-label="Gallery pagination">
              <div className="text-sm text-slate/60">
                Page {page} of {totalPages}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1 || loadingPage}
                  aria-label="Go to previous Gallery page"
                  className="inline-flex min-h-11 min-w-[7rem] items-center justify-center rounded-full border border-charcoal/20 px-4 py-2 text-sm font-medium text-charcoal transition-colors hover:border-gold hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loadingPage && page > 1 ? <LoadingSpinner size="sm" /> : "PREVIOUS"}
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages || loadingPage}
                  aria-label="Go to next Gallery page"
                  className="inline-flex min-h-11 min-w-[7rem] items-center justify-center rounded-full border border-charcoal/20 px-4 py-2 text-sm font-medium text-charcoal transition-colors hover:border-gold hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loadingPage && page < totalPages ? <LoadingSpinner size="sm" /> : "NEXT"}
                </button>
              </div>
            </nav>
          )}
        </section>
      </div>
    </PublicLayout>
  );
};

export default GalleryPage;
