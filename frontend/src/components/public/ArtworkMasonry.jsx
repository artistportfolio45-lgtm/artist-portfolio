import { Link } from "react-router-dom";

const SKELETON_RATIOS = ["4 / 5", "1 / 1", "3 / 4", "5 / 4", "2 / 3", "4 / 3"];

const responsiveImage = (url, width) => {
  if (!url?.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/f_auto,q_auto,c_limit,w_${width}/`);
};

const ArtworkMasonryItem = ({ artwork, priority = false }) => {
  const image = artwork.images?.[0];
  const title = artwork.title || "Untitled";
  const metadata = [
    artwork.category !== "Uncategorized" ? artwork.category : "",
    artwork.year,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="artwork-masonry-item">
      <Link
        to={`/artwork/${artwork._id}`}
        aria-label={`View ${title}`}
        className="artwork-masonry-link group block bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        <span className="relative block overflow-hidden">
          {image?.url ? (
            <img
              src={responsiveImage(image.url, 1000)}
              srcSet={`${responsiveImage(image.url, 600)} 600w, ${responsiveImage(image.url, 1000)} 1000w, ${responsiveImage(image.url, 1400)} 1400w`}
              sizes="(min-width: 1024px) 29vw, (min-width: 640px) 50vw, 100vw"
              width={image.width || undefined}
              height={image.height || undefined}
              alt={title}
              className="artwork-masonry-image block h-auto w-full"
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
            />
          ) : (
            <span className="flex aspect-[4/5] items-center justify-center text-sm text-slate/45">
              Image unavailable
            </span>
          )}

          <span className="artwork-masonry-overlay pointer-events-none absolute inset-0 flex items-end bg-black/0 p-4 text-left opacity-0 group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
            <span>
              <span className="block font-display text-lg font-light leading-tight text-white">
                {title}
              </span>
              {metadata && (
                <span className="mt-1 block text-[9px] font-label uppercase tracking-[0.16em] text-white/75">
                  {metadata}
                </span>
              )}
            </span>
          </span>
        </span>

        <span className="artwork-masonry-mobile-caption">
          <span className="min-w-0 truncate">{title}</span>
          {artwork.year && <span className="flex-shrink-0 text-slate/45">{artwork.year}</span>}
        </span>
      </Link>
    </article>
  );
};

const ArtworkMasonrySkeleton = ({ count = 12 }) => (
  <div role="status" aria-label="Loading artworks">
    <div className="artwork-masonry" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="artwork-masonry-item artwork-masonry-skeleton"
          style={{ aspectRatio: SKELETON_RATIOS[index % SKELETON_RATIOS.length] }}
        />
      ))}
    </div>
    <span className="sr-only">Loading artworks...</span>
  </div>
);

const ArtworkMasonry = ({
  artworks = [],
  loading = false,
  skeletonCount = 12,
  priorityCount = 0,
  emptyState = null,
  className = "",
}) => {
  if (loading) return <ArtworkMasonrySkeleton count={skeletonCount} />;
  if (!artworks.length) return emptyState;

  return (
    <div className={`artwork-masonry ${className}`.trim()}>
      {artworks.map((artwork, index) => (
        <ArtworkMasonryItem
          key={artwork._id}
          artwork={artwork}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
};

export default ArtworkMasonry;
