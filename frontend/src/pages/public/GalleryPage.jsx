import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigationType, useSearchParams } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import ArtworkMasonry from "../../components/public/ArtworkMasonry";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { publicDataAPI } from "../../services/publicData";
import { subscribeToArtworkRefresh } from "../../services/artworkRefresh";
import { clearGalleryRestoreState, galleryRestoreTargetY, normalizeGalleryPage, readGalleryRestoreState, shouldRestoreGalleryFromDetail } from "../../utils/galleryRestore";
import { MAX_SEARCH_QUERY_LENGTH, prepareSearchQuery } from "../../utils/artworkSearch";

const DEFAULT_SORT = "createdAt-desc";
const GALLERY_PAGE_SIZE = 100;
const GALLERY_RESTORE_ANCHOR_SELECTOR = "[data-gallery-artwork-id]";
const SEARCH_DEBOUNCE_MS = 250;
const getSearchParam = (params) => params.get("search") || params.get("q") || "";
const getActiveSearchParam = (params) => {
  const prepared = prepareSearchQuery(getSearchParam(params));
  return prepared.valid ? prepared.raw : "";
};

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
  const [searchInput, setSearchInput] = useState(() => getSearchParam(searchParams));
  const [search, setSearch] = useState(() => getActiveSearchParam(searchParams));
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [year, setYear] = useState(() => searchParams.get("year") || "");
  const [page, setPage] = useState(() => normalizeGalleryPage(searchParams.get("page"), 1));
  const [pageInput, setPageInput] = useState(() => String(normalizeGalleryPage(searchParams.get("page"), 1)));
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
      year,
    },
  }), [availability, category, location.pathname, location.search, page, search, sortValue, year]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isMobileFilterDialog, setIsMobileFilterDialog] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches
  );
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const gridRef = useRef(null);
  const restoreRequestedRef = useRef(false);
  const restorePendingRef = useRef(false);
  const restoreFrameRef = useRef(null);
  const activeArtworkIdRef = useRef("");
  const filterDialogRef = useRef(null);
  const filterTriggerRef = useRef(null);
  const suggestionRequestIdRef = useRef(0);

  const applyResult = useCallback((result) => {
    if (!mountedRef.current) return;
    const incoming = result.items || [];
    setArtworks(incoming);
    setPagination(result.pagination || {});
  }, []);

  const fetchArtworks = useCallback(async (requestedPage = page) => {
    const requestId = ++requestIdRef.current;
    requestedPage === 1 ? setLoading(true) : setLoadingPage(true);
    setError("");
    const [sort, order] = sortValue.split("-");

    try {
      const params = { page: requestedPage, limit: GALLERY_PAGE_SIZE, sort, order };
      if (category !== "all") params.category = category;
      if (availability !== "all") params.available = availability;
      if (search) params.search = search;
      if (year) params.year = year;

      const result = await publicDataAPI.getArtworks(params);
      if (requestId !== requestIdRef.current) return;
      applyResult(result);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError("The gallery could not be loaded. Please try again.");
    } finally {
      // A slower request for a previous page must not settle the state of the
      // page the visitor is currently viewing.
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingPage(false);
      }
    }
  }, [applyResult, availability, category, page, search, sortValue, year]);

  useEffect(() => {
    publicDataAPI.getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const nextPage = normalizeGalleryPage(searchParams.get("page"), 1);
    const nextCategory = searchParams.get("category") || "all";
    const nextAvailability = searchParams.get("availability") || "all";
    const nextSort = searchParams.get("sort") || DEFAULT_SORT;
    const nextRawSearch = getSearchParam(searchParams);
    const nextSearch = getActiveSearchParam(searchParams);
    const nextYear = searchParams.get("year") || "";

    setPage(nextPage);
    setPageInput(String(nextPage));
    setCategory(nextCategory);
    setAvailability(nextAvailability);
    setSortValue(nextSort);
    setSearch(nextSearch);
    setSearchInput(nextRawSearch);
    setYear(nextYear);
  }, [searchParams]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateFilterDialogMode = () => setIsMobileFilterDialog(mediaQuery.matches);
    updateFilterDialogMode();
    mediaQuery.addEventListener?.("change", updateFilterDialogMode);
    return () => mediaQuery.removeEventListener?.("change", updateFilterDialogMode);
  }, []);

  useEffect(() => {
    // The desktop filter controls are part of the document flow and must not
    // lock the page. Only the mobile bottom-sheet has a backdrop to lock.
    if (!filtersOpen || !isMobileFilterDialog) return undefined;
    filterTriggerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      filterDialogRef.current?.querySelector("[data-filter-dialog-close]")?.focus();
    });
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      filterTriggerRef.current?.focus?.();
    };
  }, [filtersOpen, isMobileFilterDialog]);

  useEffect(() => {
    fetchArtworks(page);
    return subscribeToArtworkRefresh(() => fetchArtworks(page));
  }, [fetchArtworks, page]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
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
    const nextYear = changes.year ?? year;

    // Applying a filter should dismiss the mobile sheet and restore document
    // scrolling immediately after the new collection is requested.
    setFiltersOpen(false);
    setPage(nextPage);
    setCategory(nextCategory);
    setAvailability(nextAvailability);
    setSortValue(nextSort);
    setSearch(nextSearch);
    setYear(nextYear);

    const nextParams = new URLSearchParams();
    if (nextPage > 1) nextParams.set("page", String(nextPage));
    if (nextCategory !== "all") nextParams.set("category", nextCategory);
    if (nextAvailability !== "all") nextParams.set("availability", nextAvailability);
    if (nextSort !== DEFAULT_SORT) nextParams.set("sort", nextSort);
    if (nextSearch) nextParams.set("search", nextSearch);
    if (nextYear) nextParams.set("year", nextYear);
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    const prepared = prepareSearchQuery(searchInput);
    const nextSearch = prepared.valid ? prepared.raw : "";
    if (nextSearch === search) return undefined;
    const timeout = window.setTimeout(() => updateCollection({ search: nextSearch }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  // updateCollection intentionally reads the latest controlled filter state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search]);

  useEffect(() => {
    const prepared = prepareSearchQuery(searchInput);
    const requestId = ++suggestionRequestIdRef.current;
    if (!prepared.valid) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      publicDataAPI.getSearchSuggestions(prepared.raw, 7)
        .then((items) => {
          if (requestId !== suggestionRequestIdRef.current) return;
          setSuggestions(items);
          setSuggestionsOpen(items.length > 0);
          setActiveSuggestionIndex(-1);
        })
        .catch(() => {
          if (requestId === suggestionRequestIdRef.current) setSuggestions([]);
        });
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const commitSearch = (value) => {
    const prepared = prepareSearchQuery(value);
    const nextSearch = prepared.valid ? prepared.raw : "";
    setSearchInput(prepared.raw);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    updateCollection({ search: nextSearch });
  };

  const chooseSuggestion = (suggestion) => {
    if (!suggestion?.label) return;
    commitSearch(suggestion.label);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveSuggestionIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveSuggestionIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && suggestionsOpen && activeSuggestionIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestionIndex]);
    } else if (event.key === "Escape") {
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    updateCollection({ category: "all", availability: "all", search: "", year: "" }, 1);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    updateCollection({ search: "" }, 1);
  };

  const hasActiveFilters =
    category !== "all" || availability !== "all" || Boolean(search || year);
  const resultCount = pagination.total ?? artworks.length;
  const totalPages = Math.max(1, Number(pagination.pages) || 1);
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const scrollGalleryToStart = useCallback(() => {
    const top = gridRef.current?.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion ? "auto" : "smooth", left: 0 });
  }, [prefersReducedMotion]);

  const goToPage = useCallback((nextPage) => {
    // Read the URL page as the source of truth. React state can still contain
    // the previous page for one render while the search params are updating.
    const currentPage = normalizeGalleryPage(searchParams.get("page"), page);
    const safePage = Math.min(Math.max(1, Number(nextPage) || 1), totalPages);
    if (safePage === currentPage || loadingPage) return;

    setLoadingPage(true);
    const nextParams = new URLSearchParams(searchParams);
    if (safePage > 1) nextParams.set("page", String(safePage)); else nextParams.delete("page");
    if (category !== "all") nextParams.set("category", category);
    if (availability !== "all") nextParams.set("availability", availability);
    if (sortValue !== DEFAULT_SORT) nextParams.set("sort", sortValue);
    if (search) nextParams.set("search", search);
    if (year) nextParams.set("year", year);
    setSearchParams(nextParams, { replace: false });
    requestAnimationFrame(() => scrollGalleryToStart());
  }, [availability, category, loadingPage, page, prefersReducedMotion, search, searchParams, setSearchParams, sortValue, totalPages, year, scrollGalleryToStart]);

  useEffect(() => {
    const restoreState = readGalleryRestoreState();
    if (!restoreState || restoreRequestedRef.current) return;

    const restoreFromDetail = shouldRestoreGalleryFromDetail(location.state, document.referrer);
    if (navigationType !== "POP" && !restoreFromDetail) {
      clearGalleryRestoreState();
      return;
    }

    if (location.pathname !== restoreState.pathname) return;

    const normalizedPage = normalizeGalleryPage(restoreState.page, 1);
    const restoreSearch = restoreState.filters?.search || "";
    const restoreCategory = restoreState.filters?.category || "all";
    const restoreAvailability = restoreState.filters?.availability || "all";
    const restoreSort = restoreState.filters?.sort || DEFAULT_SORT;
    const restoreYear = restoreState.filters?.year || "";

    if (restoreState.artworkId) activeArtworkIdRef.current = restoreState.artworkId;

    setSearchParams((current) => {
      const next = restoreState.search
        ? new URLSearchParams(restoreState.search)
        : new URLSearchParams(current);

      if (normalizedPage > 1) next.set("page", String(normalizedPage)); else next.delete("page");
      if (restoreCategory !== "all") next.set("category", restoreCategory); else next.delete("category");
      if (restoreAvailability !== "all") next.set("availability", restoreAvailability); else next.delete("availability");
      if (restoreSort !== DEFAULT_SORT) next.set("sort", restoreSort); else next.delete("sort");
      if (restoreSearch) next.set("search", restoreSearch); else next.delete("search");
      next.delete("q");
      if (restoreYear) next.set("year", restoreYear); else next.delete("year");
      next.delete("collection");
      next.delete("medium");
      next.delete("decade");
      return next;
    }, { replace: true });

    restoreRequestedRef.current = true;
  }, [location.pathname, location.search, location.state, navigationType, setSearchParams]);

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
    const resultPage = normalizeGalleryPage(pagination.page, 0);
    if (resultPage === page && pagination.pages && page > pagination.pages) {
      const safePage = Math.max(1, Number(pagination.pages) || 1);
      setPage(safePage);
      const nextParams = new URLSearchParams(searchParams);
      if (safePage > 1) nextParams.set("page", String(safePage)); else nextParams.delete("page");
      setSearchParams(nextParams, { replace: true });
    }
  }, [page, pagination.page, pagination.pages, searchParams, setSearchParams]);

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
                  className={`-mb-px min-h-11 min-w-11 border-b px-2 text-[11px] font-label uppercase tracking-[0.14em] transition-colors ${
                    category === item
                      ? "border-gold text-charcoal"
                      : "border-transparent text-slate/65 hover:text-charcoal"
                  }`}
                >
                  {item === "all" ? "All" : item}
                </button>
              ))}
            </div>
          </nav>

          <div className="mt-3 border-b border-charcoal/10 pb-3">
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <form
                className="flex w-full min-w-0 sm:w-0 sm:flex-1 lg:w-full lg:max-w-sm"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (suggestionsOpen && activeSuggestionIndex >= 0) {
                    chooseSuggestion(suggestions[activeSuggestionIndex]);
                  } else {
                    commitSearch(searchInput);
                  }
                }}
              >
                <label htmlFor="gallery-search" className="sr-only">Search artworks</label>
                <div className="relative min-w-0 flex-1">
                  <input
                    id="gallery-search"
                    type="search"
                    value={searchInput}
                    maxLength={MAX_SEARCH_QUERY_LENGTH}
                    onChange={(event) => setSearchInput(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => suggestions.length && setSuggestionsOpen(true)}
                    onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="gallery-search-suggestions"
                    aria-expanded={suggestionsOpen}
                    aria-activedescendant={activeSuggestionIndex >= 0 ? `gallery-search-option-${activeSuggestionIndex}` : undefined}
                    className="h-11 w-full min-w-0 border border-charcoal/15 bg-transparent py-2 pl-3 pr-10 text-sm text-charcoal placeholder:text-slate/35 focus:border-gold focus:outline-none"
                    placeholder="Search title or year..."
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      aria-label="Clear Gallery search"
                      className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center text-lg text-slate/55 hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    >
                      &times;
                    </button>
                  )}
                  {suggestionsOpen && suggestions.length > 0 && (
                    <ul
                      id="gallery-search-suggestions"
                      role="listbox"
                      aria-label="Artwork search suggestions"
                      className="absolute inset-x-0 top-full z-40 max-h-72 overflow-y-auto border border-t-0 border-charcoal/15 bg-white shadow-xl"
                    >
                      {suggestions.map((suggestion, index) => (
                        <li
                          id={`gallery-search-option-${index}`}
                          key={`${suggestion.type}:${suggestion.label}`}
                          role="option"
                          aria-selected={index === activeSuggestionIndex}
                        >
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseSuggestion(suggestion)}
                            className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                              index === activeSuggestionIndex ? "bg-charcoal text-white" : "text-charcoal hover:bg-cream"
                            }`}
                          >
                            <span className="truncate">{suggestion.label}</span>
                            <span className="flex-shrink-0 text-[9px] font-label uppercase tracking-widest opacity-55">{suggestion.type}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
                className="h-11 flex-shrink-0 border border-charcoal/15 px-3 text-xs font-label uppercase tracking-[0.12em] text-charcoal sm:text-sm sm:normal-case sm:tracking-normal"
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
              className={`hidden lg:grid grid-cols-1 gap-2 overflow-hidden transition-all sm:grid-cols-2 lg:grid-cols-3 ${
                filtersOpen ? "mt-3 max-h-96 opacity-100" : "mt-0 max-h-0 opacity-0"
              }`}
            >
              {availabilitySelect}
              {sortSelect}
              {[["year", year, setYear]].map(([key, value, setter]) => (
                <label key={key} className="block">
                  <span className="sr-only">Filter by {key}</span>
                  <input
                    type={key === "year" ? "number" : "text"}
                    value={value}
                    onChange={(event) => setter(event.target.value)}
                    onBlur={() => updateCollection({ year })}
                    onKeyDown={(event) => { if (event.key === "Enter") updateCollection({ year }); }}
                    className="h-11 w-full border border-charcoal/15 bg-transparent px-3 text-sm text-charcoal focus:border-gold focus:outline-none"
                    placeholder={key[0].toUpperCase() + key.slice(1)}
                  />
                </label>
              ))}
            </div>
            {filtersOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                  aria-label="Close filters"
                />
                <section
                  ref={filterDialogRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="gallery-filter-dialog-title"
                  className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white p-5 pb-6 shadow-2xl"
                >
                  <div className="mb-6 flex items-center justify-between gap-4">
                    <p id="gallery-filter-dialog-title" className="text-xs font-label uppercase tracking-[0.25em] text-slate/70">Filter artworks</p>
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                      data-filter-dialog-close
                      className="text-sm uppercase tracking-[0.2em] text-charcoal/80"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {availabilitySelect}
                    {sortSelect}
                    <label className="block">
                      <span className="sr-only">Filter by year</span>
                      <input
                        type="number"
                        value={year}
                        onChange={(event) => setYear(event.target.value)}
                        onBlur={() => updateCollection({ year })}
                        className="h-11 w-full border border-charcoal/15 bg-transparent px-3 text-sm text-charcoal focus:border-gold focus:outline-none"
                        placeholder="Year"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        clearFilters();
                        setFiltersOpen(false);
                      }}
                      className="btn-secondary w-full"
                    >
                      Clear filters
                    </button>
                  </div>
                </section>
              </div>
            )}

            <div className="mt-2 flex min-h-7 items-center justify-between gap-4 text-xs text-slate/80">
              <p aria-live="polite">
                {loading && artworks.length === 0
                  ? "Loading collection..."
                  : loading
                    ? search ? "Searching..." : "Updating collection..."
                    : `${resultCount} ${resultCount === 1 ? "artwork" : "artworks"}${search ? ` for “${search}”` : ""}`}
                {searchInput.trim().length === 1 && !search && " — enter at least 2 characters to search"}
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
          {error && !loading && (
            <div role="alert" className={`mx-auto max-w-xl px-6 text-center ${artworks.length ? "mb-6 border border-red-200 bg-red-50 py-4" : "my-16 py-12"}`}>
              <p className={artworks.length ? "text-sm font-medium" : "font-display text-3xl"}>
                {artworks.length ? "Gallery refresh failed" : "Gallery unavailable"}
              </p>
              <p className="mt-2 text-sm text-slate/80">{error}</p>
              <button type="button" onClick={() => fetchArtworks(page)} className="btn-secondary mt-4">
                Retry
              </button>
            </div>
          )}
          {(!error || artworks.length > 0) && (
            <ArtworkMasonry
              artworks={artworks}
              loading={loading && artworks.length === 0}
              priorityCount={6}
              galleryRestoreState={restoreState}
              emptyState={
                <div className="mx-auto my-16 max-w-xl px-6 py-12 text-center">
                  <p className="font-display text-3xl">No artworks found</p>
                  <p className="mt-3 text-sm text-slate/80">Try adjusting the search or filters.</p>
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
              <nav className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-charcoal/10 pt-5 sm:mt-8 sm:pt-6" aria-label="Gallery pagination">
                <div className="text-sm text-slate/60">
                  Page {page} of {totalPages}
                </div>
                <form
                  className="flex items-center gap-2"
                  aria-label="Jump to Gallery page"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const target = Math.min(Math.max(1, Number.parseInt(pageInput, 10) || 1), totalPages);
                    setPageInput(String(target));
                    goToPage(target);
                  }}
                >
                  <label htmlFor="gallery-page-number" className="text-xs text-slate/80 sm:text-sm">Go to page</label>
                  <input
                    id="gallery-page-number"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={totalPages}
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value)}
                    className="h-11 w-16 rounded-full border border-charcoal/20 bg-transparent px-2 text-center text-sm text-charcoal focus:border-gold focus:outline-none sm:w-20"
                  />
                  <button type="submit" className="inline-flex h-11 items-center justify-center rounded-full border border-charcoal/20 px-3 text-xs font-medium text-charcoal hover:border-gold hover:text-gold disabled:opacity-40" disabled={loadingPage}>GO</button>
                </form>
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => goToPage(normalizeGalleryPage(searchParams.get("page"), page) - 1)}
                    disabled={page <= 1 || loadingPage}
                    aria-label="Go to previous Gallery page"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-charcoal/20 px-3 py-2 text-xs font-medium text-charcoal transition-colors hover:border-gold hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[7rem] sm:px-4 sm:text-sm"
                  >
                    {loadingPage && page > 1 ? <LoadingSpinner size="sm" /> : "PREVIOUS"}
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(normalizeGalleryPage(searchParams.get("page"), page) + 1)}
                    disabled={page >= totalPages || loadingPage}
                    aria-label="Go to next Gallery page"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-charcoal/20 px-3 py-2 text-xs font-medium text-charcoal transition-colors hover:border-gold hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[7rem] sm:px-4 sm:text-sm"
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
