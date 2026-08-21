import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cloudinaryThumbnailUrl } from "../../utils/imageDelivery";
import { getHomeHeroPresentation } from "../../utils/homeHero";

const MODE_CLASSES = {
  mobile: {
    section: "min-h-[440px] items-center",
    content: "px-5 py-16 text-left",
    inner: "max-w-xl",
    eyebrow: "mb-3",
    heading: "text-4xl mb-4",
    subtitle: "text-sm mb-8 max-w-xl",
    buttons: "flex-col gap-3",
    button: "w-full text-center",
  },
  tablet: {
    section: "min-h-[500px] items-center",
    content: "px-10 py-20 text-left",
    inner: "max-w-2xl",
    eyebrow: "mb-4",
    heading: "text-6xl mb-6",
    subtitle: "text-base mb-9 max-w-xl",
    buttons: "flex-row gap-4",
    button: "text-center",
  },
  desktop: {
    section: "min-h-[620px] items-center justify-center",
    content: "container-site py-32 text-center",
    inner: "max-w-4xl mx-auto",
    eyebrow: "mb-6",
    heading: "text-8xl mb-8",
    subtitle: "text-xl mb-12 max-w-lg mx-auto",
    buttons: "flex-row gap-4 justify-center",
    button: "text-center",
  },
};

const RESPONSIVE_CLASSES = {
  section: "min-h-[420px] items-center lg:min-h-screen lg:justify-center",
  content: "w-full px-5 py-16 text-left sm:px-8 sm:py-20 lg:container-site lg:py-32 lg:text-center",
  inner: "mx-auto max-w-xl lg:max-w-4xl",
  eyebrow: "mb-3 lg:mb-6",
  heading: "mb-4 text-4xl sm:text-5xl lg:mb-8 lg:text-8xl",
  subtitle: "mb-8 max-w-xl text-sm sm:text-base lg:mx-auto lg:mb-12 lg:max-w-lg lg:text-xl",
  buttons: "flex-col gap-3 sm:flex-row sm:gap-4 lg:justify-center",
  button: "w-full text-center sm:w-auto",
};

const HomeHero = ({ settings, previewMode = "responsive", showScrollIndicator = true }) => {
  const presentation = getHomeHeroPresentation(settings);
  const { background } = presentation;
  const [failedUrl, setFailedUrl] = useState("");
  const classes = MODE_CLASSES[previewMode] || RESPONSIVE_CLASSES;
  const requestedWidth = previewMode === "mobile" ? 960 : previewMode === "tablet" ? 1440 : 2400;
  const imageUrl = background?.url
    ? cloudinaryThumbnailUrl(background.url, requestedWidth)
    : "";
  const imageSrcSet = background?.url
    ? [...new Set([960, 1440, 2400].map((width) => cloudinaryThumbnailUrl(background.url, width)))]
      .map((url, index) => `${url} ${[960, 1440, 2400][index]}w`)
      .join(", ")
    : "";
  const showImage = imageUrl && failedUrl !== imageUrl;

  useEffect(() => {
    setFailedUrl("");
  }, [imageUrl]);

  return (
    <section
      className={`relative flex overflow-hidden bg-charcoal text-white ${classes.section}`}
      aria-label="Hero"
      data-hero-background-source={background?.source || "none"}
      data-preview-mode={previewMode}
    >
      <div
        className="absolute inset-0 opacity-10"
        style={{ backgroundImage: "radial-gradient(circle at 30% 70%, #C9A84C 0%, transparent 60%)" }}
        aria-hidden="true"
      />

      {showImage && (
        <img
          src={imageUrl}
          srcSet={imageSrcSet || undefined}
          sizes="100vw"
          alt={background.altText}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: background.position }}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onError={() => setFailedUrl(imageUrl)}
        />
      )}

      {background && (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: background.overlayOpacity }}
          aria-hidden="true"
          data-hero-overlay={background.overlayOpacity}
        />
      )}

      <div className={`relative z-10 ${classes.content}`}>
        <div className={classes.inner}>
          <p className={`eyebrow text-gold ${classes.eyebrow}`}>{presentation.eyebrow}</p>
          <h1 className={`font-display font-light leading-tight text-white ${classes.heading}`}>
            {presentation.heading}
            <br />
            <em className="italic">{presentation.headingAccent}</em>
          </h1>
          <p className={`font-light leading-relaxed text-white/80 ${classes.subtitle}`}>
            {presentation.subtitle}
          </p>
          <div className={`flex ${classes.buttons}`}>
            <Link to="/gallery" className={`btn-gold ${classes.button}`}>
              {presentation.primaryButtonText}
            </Link>
            <Link
              to="/contact"
              className={`btn-secondary border-white/40 text-white hover:bg-white hover:text-charcoal ${classes.button}`}
            >
              {presentation.secondaryButtonText}
            </Link>
          </div>
        </div>
      </div>

      {showScrollIndicator && (previewMode === "responsive" || previewMode === "desktop") && (
        <div className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/40 lg:flex">
          <span className="text-xs font-label uppercase tracking-widest">Scroll</span>
          <div className="h-12 w-px bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      )}
    </section>
  );
};

export default HomeHero;
