import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { publicDataAPI } from "../../services/publicData";

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
        className="group relative block overflow-hidden bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        {image?.url ? (
          <img
            src={responsiveImage(image.url, 1000)}
            srcSet={`${responsiveImage(image.url, 600)} 600w, ${responsiveImage(image.url, 1000)} 1000w, ${responsiveImage(image.url, 1400)} 1400w`}
            sizes="(min-width: 1900px) 16.7vw, (min-width: 1440px) 20vw, (min-width: 1100px) 25vw, (min-width: 768px) 33.3vw, (min-width: 480px) 50vw, 100vw"
            width={image.width || undefined}
            height={image.height || undefined}
            alt={title}
            className="block h-auto w-full transition duration-500 ease-out group-hover:scale-[1.012] group-hover:brightness-[0.82]"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
          />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center text-sm text-slate/45">
            Image unavailable
          </div>
        )}
        <span className="pointer-events-none absolute inset-0 flex items-end bg-black/0 p-4 text-left opacity-0 transition duration-300 group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
          <span>
            <span className="block font-display text-lg font-light leading-tight text-white">{title}</span>
            {artwork.category && artwork.category !== "Uncategorized" && (
              <span className="mt-1 block text-[9px] font-label uppercase tracking-[0.18em] text-white/70">
                {artwork.category}
              </span>
            )}
          </span>
        </span>
      </Link>
    </article>
  );
};

const GalleryPage = () => {
  const [artworks, setArtworks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sortValue, setSortValue] = useState("createdAt-desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
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

  const resetCollection = (callback) => {
    setPage(1);
    setArtworks([]);
    callback();
  };

  return (
    <PublicLayout>
      <main className="min-h-screen bg-white pt-16 md:pt-20">
        <header className="container-site pb-7 pt-8 md:pb-9 md:pt-14">
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
                    onClick={() => resetCollection(() => setCategory(item))}
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

          <div className="mt-5 flex flex-col gap-3 border-b border-charcoal/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <form
              className="flex w-full lg:max-w-md"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                resetCollection(() => setSearch(searchInput.trim()));
              }}
            >
              <label htmlFor="gallery-search" className="sr-only">Search artworks</label>
              <input
                id="gallery-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="h-10 min-w-0 flex-1 border border-charcoal/15 bg-transparent px-3 text-sm text-charcoal placeholder:text-slate/35 focus:border-gold focus:outline-none"
                placeholder="Search artworks"
              />
              <button
                type="submit"
                className="h-10 flex-shrink-0 border border-l-0 border-charcoal/15 px-4 text-[10px] font-label uppercase tracking-[0.16em] text-charcoal transition-colors hover:border-charcoal hover:bg-charcoal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                Search
              </button>
            </form>

            <div className="flex gap-3 overflow-x-auto pb-px">
              <label className="flex min-w-max items-center gap-2 text-[10px] font-label uppercase tracking-[0.14em] text-slate/45">
                Availability
                <select
                  value={availability}
                  onChange={(event) => resetCollection(() => setAvailability(event.target.value))}
                  className="h-10 border border-charcoal/15 bg-transparent px-3 text-xs normal-case tracking-normal text-charcoal focus:border-gold focus:outline-none"
                >
                  <option value="all">All</option>
                  <option value="true">Available</option>
                  <option value="false">Not available</option>
                </select>
              </label>
              <label className="flex min-w-max items-center gap-2 text-[10px] font-label uppercase tracking-[0.14em] text-slate/45">
                Sort
                <select
                  value={sortValue}
                  onChange={(event) => resetCollection(() => setSortValue(event.target.value))}
                  className="h-10 border border-charcoal/15 bg-transparent px-3 text-xs normal-case tracking-normal text-charcoal focus:border-gold focus:outline-none"
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
        </header>

        <section className="px-2 pb-4 sm:px-3 lg:px-4" aria-live="polite">
          {loading ? (
            <div className="flex min-h-[48vh] items-center justify-center"><LoadingSpinner size="lg" /></div>
          ) : error ? (
            <div className="mx-auto my-16 max-w-xl border border-charcoal/10 bg-ivory px-6 py-12 text-center">
              <p className="font-display text-3xl">Gallery unavailable</p>
              <p className="mt-3 text-sm text-slate/60">{error}</p>
              <button type="button" onClick={fetchArtworks} className="btn-secondary mt-6">Retry</button>
            </div>
          ) : artworks.length === 0 ? (
            <div className="mx-auto my-16 max-w-xl border border-charcoal/10 bg-ivory px-6 py-12 text-center">
              <p className="font-display text-3xl">No artworks found</p>
              <p className="mt-3 text-sm text-slate/60">Try adjusting the search or filters.</p>
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
      </main>
    </PublicLayout>
  );
};

export default GalleryPage;
