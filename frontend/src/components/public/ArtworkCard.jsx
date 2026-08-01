import { Link } from "react-router-dom";

const ArtworkCard = ({ artwork, variant, onPreview }) => {
  const image = artwork.images?.[0];
  const title = artwork.title || "Untitled";

  if (variant === "featured") {
    const formattedPrice = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(artwork.price || 0);

    const handlePreview = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onPreview?.(artwork);
    };

    return (
      <article className="featured-artwork-card group animate-fade-in">
        <div
          className="relative aspect-artwork overflow-hidden bg-white shadow-sm ring-1 ring-black/5 transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-xl group-focus-within:-translate-y-1 group-focus-within:shadow-xl"
          style={{ borderRadius: "var(--theme-card-radius)" }}
        >
          <Link
            to={`/artwork/${artwork._id}`}
            aria-label={`View ${title}`}
            className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
          >
            {image?.url ? (
              <img
                src={image.url}
                width={image.width || undefined}
                height={image.height || undefined}
                alt={title}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 group-focus-within:scale-105"
                loading="lazy"
                decoding="async"
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

          <div className="absolute inset-x-3 bottom-3 translate-y-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
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

        <div className="pb-2 pt-4">
          <p className="mb-1 text-[10px] font-label uppercase tracking-widest text-slate/60">
            {artwork.category}
          </p>
          <Link to={`/artwork/${artwork._id}`}>
            <h3 className="mb-2 font-display text-xl font-light leading-tight text-charcoal transition-colors group-hover:text-gold group-focus-within:text-gold">
              {title}
            </h3>
          </Link>
          <div className="flex items-start justify-between gap-3">
            <p className="font-label text-sm font-medium text-charcoal">{formattedPrice}</p>
            {artwork.medium && (
              <p className="text-right text-xs leading-relaxed text-slate/50">{artwork.medium}</p>
            )}
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
        {image?.url ? (
          <img
            src={image.url}
            width={image.width || undefined}
            height={image.height || undefined}
            alt={title}
            className="block h-auto w-full transition duration-500 group-hover:scale-[1.015] group-hover:brightness-[0.9]"
            loading="lazy"
            decoding="async"
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
