// pages/public/GalleryPage.jsx
// Public gallery redesigned as an image-first editorial masonry view.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { publicDataAPI } from "../../services/publicData";

const tileStyles = [
  "sm:col-span-2 lg:col-span-2 aspect-[16/10]",
  "aspect-[4/5]",
  "aspect-square",
  "aspect-[3/4]",
  "sm:col-span-2 aspect-[5/3]",
  "aspect-[4/5]",
  "aspect-square",
  "lg:col-span-2 aspect-[16/11]",
];

const GalleryTile = ({ artwork, priority = false, index = 0 }) => {
  const thumbnail = artwork?.images?.[0]?.url;
  const title = artwork?.title || "Untitled artwork";
  const tileClass = tileStyles[index % tileStyles.length];

  return (
    <article className={tileClass}>
      <Link
        to={`/artwork/${artwork._id}`}
        aria-label={`View ${title}`}
        className="group block h-full overflow-hidden bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        <div className="relative h-full overflow-hidden bg-ivory">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.055] group-focus-visible:scale-[1.055]"
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
            />
          ) : (
            <div className="flex aspect-artwork w-full items-center justify-center bg-gray-100 text-sm text-slate/45">
              Image coming soon
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.68))] opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-3 p-5 text-white opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            {artwork?.category && (
              <p className="mb-2 text-[10px] font-label uppercase tracking-[0.2em] text-white/72">
                {artwork.category}
              </p>
            )}
            <h3 className="font-display text-2xl font-light leading-tight text-white">
              {title}
            </h3>
            <p className="mt-3 text-[11px] font-label uppercase tracking-[0.18em] text-white/76">
              View details
            </p>
          </div>

          {artwork?.isFeatured && (
            <span className="absolute left-3 top-3 bg-gold px-2.5 py-1 text-[10px] font-label uppercase tracking-[0.18em] text-white">
              Featured
            </span>
          )}
        </div>
      </Link>
    </article>
  );
};

const CategoryFilter = ({ categories, active, onChange }) => (
  <div className="overflow-x-auto pb-2" aria-label="Artwork categories">
    <div className="flex min-w-max items-center justify-center gap-2 text-sm text-slate/58">
      {["all", ...categories].map((category, index) => {
        const label = category === "all" ? "All" : category;
        const isActive = active === category;

        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            className={`px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
              isActive ? "border-b border-gold text-gold" : "hover:text-charcoal"
            }`}
          >
            {label}
            {index < categories.length && <span className="ml-4 text-slate/35" aria-hidden="true">|</span>}
          </button>
        );
      })}
    </div>
  </div>
);

const GalleryPage = () => {
  const [artworks, setArtworks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  const fetchArtworks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = { page, limit: 18 };
      if (category !== "all") params.category = category;

      const res = await publicDataAPI.getArtworks(params);
      setArtworks(res.items || []);
      setPagination(res.pagination || {});
    } catch {
      setError("The gallery could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [category, page]);

  useEffect(() => {
    publicDataAPI.getCategories()
      .then((items) => setCategories(items || []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    fetchArtworks();
  }, [fetchArtworks]);

  return (
    <PublicLayout>
      <div className="bg-charcoal pt-28 pb-16">
        <div className="container-site text-center">
          <p className="eyebrow text-gold mb-3">Complete Collection</p>
          <h1 className="font-display text-5xl md:text-7xl font-light text-white">
            The Gallery
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm md:text-base text-white/60 leading-relaxed">
            Browse the collection by category in a clean, artwork-first view.
          </p>
        </div>
      </div>

      <section className="section bg-white">
        <div className="container-site">
          <div className="mb-10">
            <CategoryFilter
              categories={categories}
              active={category}
              onChange={(nextCategory) => {
                setCategory(nextCategory);
                setPage(1);
              }}
            />
          </div>

          {loading ? (
            <div className="flex min-h-[42vh] items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="mx-auto max-w-xl border border-charcoal/10 bg-ivory px-6 py-12 text-center">
              <p className="font-display text-3xl text-charcoal">Gallery unavailable</p>
              <p className="mt-3 text-sm leading-6 text-slate/60">{error}</p>
              <button type="button" onClick={fetchArtworks} className="btn-secondary mt-6">
                Retry
              </button>
            </div>
          ) : artworks.length === 0 ? (
            <div className="mx-auto max-w-xl border border-charcoal/10 bg-ivory px-6 py-12 text-center">
              <p className="font-display text-3xl text-charcoal">No artworks found</p>
              <p className="mt-3 text-sm text-slate/60">Try another category.</p>
            </div>
          ) : (
            <div className="grid auto-rows-auto grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {artworks.map((artwork, index) => (
                <GalleryTile key={artwork._id} artwork={artwork} index={index} priority={index < 3} />
              ))}
            </div>
          )}

          {pagination.pages > 1 && (
            <div className="mt-12 flex flex-col items-center gap-4">
              <p className="text-xs text-slate/45">
                Page {page} of {pagination.pages}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page === 1}
                  className="border border-charcoal/20 px-4 py-2 text-sm font-label transition-colors hover:bg-charcoal hover:text-white disabled:opacity-30"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))}
                  disabled={page === pagination.pages}
                  className="border border-charcoal/20 px-4 py-2 text-sm font-label transition-colors hover:bg-charcoal hover:text-white disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
};

export default GalleryPage;
