import { useCallback, useEffect, useState } from "react";
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
            sizes="(min-width: 1500px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            width={image.width || undefined}
            height={image.height || undefined}
            alt={title}
            className="block h-auto w-full transition duration-500 ease-out group-hover:scale-[1.015] group-hover:brightness-[0.88]"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
          />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center text-sm text-slate/45">
            Image unavailable
          </div>
        )}
        <span className="pointer-events-none absolute bottom-3 left-3 translate-y-1 bg-black/55 px-2.5 py-1.5 text-[10px] font-label uppercase tracking-[0.16em] text-white opacity-0 backdrop-blur-sm transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          View artwork
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
      const params = { page, limit: 20, sort, order };
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

  const resetCollection = (callback) => {
    setPage(1);
    setArtworks([]);
    callback();
  };

  return (
    <PublicLayout>
      <main className="min-h-screen bg-white pt-20">
        <header className="border-b border-charcoal/10 px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="eyebrow mb-2">Complete Collection</p>
              <h1 className="font-display text-4xl font-light text-charcoal md:text-5xl">Gallery</h1>
            </div>

            <form
              className="flex w-full max-w-xl"
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
                className="input-field min-w-0"
                placeholder="Search title, category, medium..."
              />
              <button type="submit" className="btn-primary flex-shrink-0">Search</button>
            </form>
          </div>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="overflow-x-auto" aria-label="Artwork categories">
              <div className="flex min-w-max gap-1">
                {["all", ...categories].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => resetCollection(() => setCategory(item))}
                    className={`px-3 py-2 text-xs font-label uppercase tracking-[0.14em] transition ${
                      category === item ? "bg-charcoal text-white" : "text-slate/60 hover:bg-charcoal/5 hover:text-charcoal"
                    }`}
                  >
                    {item === "all" ? "All" : item}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex items-center gap-2 text-xs font-label uppercase tracking-widest text-slate/55">
                Availability
                <select
                  value={availability}
                  onChange={(event) => resetCollection(() => setAvailability(event.target.value))}
                  className="input-field py-2"
                >
                  <option value="all">All</option>
                  <option value="true">Available</option>
                  <option value="false">Not available</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-label uppercase tracking-widest text-slate/55">
                Sort
                <select
                  value={sortValue}
                  onChange={(event) => resetCollection(() => setSortValue(event.target.value))}
                  className="input-field py-2"
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

        <section className="px-2 py-3 sm:px-3" aria-live="polite">
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
                <GalleryTile key={artwork._id} artwork={artwork} priority={index < 4} />
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
