import { useState } from "react";
import { Link } from "react-router-dom";
import { cloudinaryThumbnailUrl, galleryThumbnailWidths, imageAspectRatio } from "../../utils/imageDelivery";

const ArtworkCard = ({ artwork, variant, onPreview, priority = false }) => {
  const image = artwork.images?.[0];
  const rawTitle = String(artwork.title || "").trim();
  const title = rawTitle || "Artwork";
  const [failedUrls, setFailedUrls] = useState(() => new Set());
  const [useOriginal, setUseOriginal] = useState(false);
  const imageUrl = image?.url && !failedUrls.has(image.url) ? image.url : "";
  const handleImageError = (event) => {
    const failed = event.currentTarget.src;
    if (!useOriginal && imageUrl && failed !== imageUrl) {
      setUseOriginal(true);
      return;
    }
    setFailedUrls((current) => new Set([...current, failed]));
  };
  const thumbnailSrcSet = imageUrl
    ? galleryThumbnailWidths(image?.width).map((width) => `${cloudinaryThumbnailUrl(imageUrl, width)} ${width}w`).join(", ")
    : undefined;

  if (variant === "featured") {
    const numericPrice = Number(artwork.price);
    const formattedPrice = Number.isFinite(numericPrice) && numericPrice >= 0
      ? new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
      }).format(numericPrice)
      : null;
    const category = String(artwork.category || "").trim();
    const medium = String(artwork.medium || "").trim();

    const handlePreview = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onPreview?.(artwork);
    };

    return (
      <article className="featured-artwork-card group min-w-0 animate-fade-in">
        <div
          className="relative aspect-artwork overflow-hidden bg-white shadow-sm ring-1 ring-black/5 transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-xl group-focus-within:-translate-y-1 group-focus-within:shadow-xl"
          style={{ borderRadius: "var(--theme-card-radius)" }}
        >
          <Link
            to={`/artwork/${artwork._id}`}
            aria-label={`View ${title}`}
            className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
          >
            {imageUrl ? (
              <img
                src={useOriginal ? imageUrl : cloudinaryThumbnailUrl(imageUrl, 960)}
                srcSet={!useOriginal ? galleryThumbnailWidths(image.width).map((width) => `${cloudinaryThumbnailUrl(imageUrl, width)} ${width}w`).join(", ") : undefined}
                sizes="(max-width: 639px) 92vw, (max-width: 1023px) 45vw, 30vw"
                width={image.width || undefined}
                height={image.height || undefined}
                alt={title}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 group-focus-within:scale-105"
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : "auto"}
                decoding="async"
                onError={handleImageError}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-100 text-slate/35">
                No image
              </div>
            )}
          </Link>

          <div className="pointer-events-none absolute inset-0 bg-charcoal/0 transition-all duration-500 group-hover:bg-charcoal/30 group-focus-within:bg-charcoal/30" />

          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
            {artwork.isFeatured && (
              <span className="bg-gold px-2 py-1 text-[10px] font-label uppercase tracking-widest text-white shadow-sm">
                Featured
              </span>
            )}
            {!artwork.isAvailable && (
              <span className="bg-charcoal px-2 py-1 text-[10px] font-label uppercase tracking-widest text-white shadow-sm">
                Not Available
              </span>
            )}
          </div>

          <div className="featured-artwork-actions absolute inset-x-3 bottom-3 translate-y-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handlePreview}
                className="bg-white/95 px-3 py-2 text-xs font-label uppercase tracking-widest text-charcoal transition-colors hover:bg-gold hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                Preview
              </button>
              <Link
                to={`/artwork/${artwork._id}`}
                className="bg-charcoal/95 px-3 py-2 text-center text-xs font-label uppercase tracking-widest text-white transition-colors hover:bg-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                Details
              </Link>
            </div>
          </div>
        </div>

      </article>
    );
  }

  return (
    <article className="group animate-fade-in">
      <Link
        to={`/artwork/${artwork._id}`}
        aria-label={`View ${title}`}
        className="relative block overflow-hidden bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        {imageUrl ? (
          <img
            src={cloudinaryThumbnailUrl(imageUrl, 960)}
            srcSet={thumbnailSrcSet}
            sizes="(max-width: 639px) 92vw, (max-width: 1023px) 45vw, 33vw"
            width={image.width || undefined}
            height={image.height || undefined}
            alt={title}
            className="block h-auto w-full transition duration-500 group-hover:scale-[1.015] group-hover:brightness-[0.9]"
            style={{ aspectRatio: imageAspectRatio(image) }}
            loading="lazy"
            decoding="async"
            onError={handleImageError}
          />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center text-sm text-slate/40">Image unavailable</div>
        )}
        <span className="pointer-events-none absolute bottom-3 left-3 translate-y-1 bg-black/55 px-2.5 py-1.5 text-[10px] font-label uppercase tracking-widest text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          View artwork
        </span>
      </Link>
    </article>
  );
};

export default ArtworkCard;
