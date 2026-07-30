import { Link } from "react-router-dom";

const ArtworkCard = ({ artwork }) => {
  const image = artwork.images?.[0];
  const title = artwork.title || "Untitled";

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
