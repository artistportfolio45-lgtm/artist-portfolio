import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { saveGalleryRestoreState } from "../../utils/galleryRestore";
import {
  GALLERY_THUMBNAIL_WIDTHS,
  cloudinaryThumbnailUrl,
  galleryThumbnailWidths,
  imageAspectRatio,
} from "../../utils/imageDelivery";

const SKELETON_RATIOS = ["4 / 5", "1 / 1", "3 / 4", "5 / 4", "2 / 3", "4 / 3"];

const GALLERY_IMAGE_SIZES =
  "(min-width: 2240px) 615px, (min-width: 1883px) calc(33.333vw - 132px), (min-width: 1471px) calc(27.667vw - 25.333px), (min-width: 1024px) calc(33.333vw - 108.667px), (min-width: 640px) calc(50vw - 30px), calc(100vw - 32px)";

const ArtworkMasonryImage = ({ image, title, priority }) => {
  const originalUrl = image.url;
  const thumbnailWidths = galleryThumbnailWidths(image.width);
  const defaultWidth =
    thumbnailWidths.find((width) => width >= GALLERY_THUMBNAIL_WIDTHS[1]) ||
    thumbnailWidths[thumbnailWidths.length - 1];
  const optimizedUrl = cloudinaryThumbnailUrl(originalUrl, defaultWidth);
  const optimizedSrcSet = thumbnailWidths
    .map((width) => `${cloudinaryThumbnailUrl(originalUrl, width)} ${width}w`)
    .join(", ");
  const hasOptimizedSource = optimizedUrl !== originalUrl;
  const hasIntrinsicDimensions = Number(image.width) > 0 && Number(image.height) > 0;
  const [status, setStatus] = useState("loading");
  const [useOriginal, setUseOriginal] = useState(false);
  const [loadMode, setLoadMode] = useState(priority ? "eager" : null);
  const loadImmediately = loadMode === "eager";
  const frameRef = useRef(null);
  const imageRef = useRef(null);
  const sourceUrl = useOriginal ? originalUrl : optimizedUrl;

  const handleFailure = useCallback(() => {
    if (!useOriginal && hasOptimizedSource) {
      setStatus("loading");
      setUseOriginal(true);
      return;
    }

    setStatus("error");
  }, [hasOptimizedSource, useOriginal]);

  const syncCompletedImage = useCallback(() => {
    const node = imageRef.current;
    if (!node?.complete) return;

    if (node.naturalWidth > 0) {
      setStatus("loaded");
    } else {
      handleFailure();
    }
  }, [handleFailure]);

  const setImageRef = useCallback((node) => {
    imageRef.current = node;
  }, []);

  useLayoutEffect(() => {
    if (loadMode === null) {
      const bounds = frameRef.current?.getBoundingClientRect();
      const visible = bounds && bounds.top < window.innerHeight && bounds.bottom > 0;
      setLoadMode(priority || visible ? "eager" : "lazy");
      return;
    }

    const node = imageRef.current;
    if (!node) return;

    syncCompletedImage();
  }, [loadMode, priority, sourceUrl, syncCompletedImage]);

  return (
    <span
      className="artwork-masonry-image-frame relative block overflow-hidden"
      ref={frameRef}
      style={{ aspectRatio: imageAspectRatio(image) }}
      aria-busy={status === "loading"}
      data-image-status={status}
    >
      {status === "loading" && (
        <span className="artwork-masonry-image-skeleton absolute inset-0" aria-hidden="true" />
      )}

      {status === "error" && (
        <span className="absolute inset-0 flex items-center justify-center text-sm text-slate/45">
          Image unavailable
        </span>
      )}

      {loadMode !== null && <img
        ref={setImageRef}
        src={sourceUrl}
        srcSet={!useOriginal && hasOptimizedSource ? optimizedSrcSet : undefined}
        sizes={!useOriginal && hasOptimizedSource ? GALLERY_IMAGE_SIZES : undefined}
        width={hasIntrinsicDimensions ? Number(image.width) : 4}
        height={hasIntrinsicDimensions ? Number(image.height) : 5}
        alt={title}
        className={`artwork-masonry-image block h-full w-full ${
          hasIntrinsicDimensions ? "object-cover" : "object-contain"
        } ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        loading={loadImmediately ? "eager" : "lazy"}
        fetchPriority={loadImmediately ? "high" : "auto"}
        decoding="async"
        onLoad={(event) => {
          if (event.currentTarget.naturalWidth > 0) {
            setStatus("loaded");
          } else {
            handleFailure();
          }
        }}
        onError={handleFailure}
      />}
    </span>
  );
};

const ArtworkMasonryItem = ({ artwork, priority = false, galleryRestoreState = null }) => {
  const image = artwork.images?.[0];
  const title = artwork.title || "Untitled";
  const metadata = [
    artwork.category !== "Uncategorized" ? artwork.category : "",
    artwork.year,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleRestoreClick = (event) => {
    if (!galleryRestoreState) return;
    saveGalleryRestoreState({
      ...galleryRestoreState,
      artworkId: artwork._id,
      scrollY: window.scrollY,
      anchorOffset: event.currentTarget.closest("[data-gallery-artwork-id]")?.getBoundingClientRect().top,
    });
  };

  return (
    <article className="artwork-masonry-item" data-gallery-artwork-id={artwork._id}>
      <Link
        to={`/artwork/${artwork._id}`}
        state={{ restoreFromArtwork: true }}
        onClick={handleRestoreClick}
        aria-label={`View ${title}`}
        className="artwork-masonry-link group block bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        <span className="relative block overflow-hidden">
          {image?.url ? (
            <ArtworkMasonryImage
              key={`${image.url}:${image.width || ""}:${image.height || ""}`}
              image={image}
              title={title}
              priority={priority}
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
  galleryRestoreState = null,
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
          galleryRestoreState={galleryRestoreState}
        />
      ))}
    </div>
  );
};

export default ArtworkMasonry;
