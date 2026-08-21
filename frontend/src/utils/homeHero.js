export const HERO_BACKGROUND_POSITIONS = ["center", "top", "bottom", "left", "right"];

export const getHomeHeroPresentation = (settings = {}) => {
  const background = settings?.heroBackground;
  const source = background?.source;
  const hasSelectedImage =
    (source === "upload" || source === "artwork") &&
    typeof background?.url === "string" &&
    background.url.trim().length > 0;

  const rawOpacity = Number(background?.overlayOpacity ?? settings?.heroOverlayOpacity ?? 0.55);
  const overlayOpacity = Number.isFinite(rawOpacity)
    ? Math.min(0.9, Math.max(0.2, rawOpacity))
    : 0.55;
  const position = HERO_BACKGROUND_POSITIONS.includes(
    background?.position || settings?.heroBackgroundPosition
  )
    ? background?.position || settings.heroBackgroundPosition
    : "center";

  return {
    background: hasSelectedImage ? {
      ...background,
      altText: String(background.altText || settings?.heroBackgroundAltText || "").trim(),
      position,
      overlayOpacity,
    } : null,
    eyebrow: settings?.heroEyebrow || "Original Fine Art",
    heading: settings?.heroHeading || "Art That",
    headingAccent: settings?.heroHeadingAccent || "Speaks",
    subtitle: settings?.heroSubtitle || "Explore a collection of original paintings — each a singular expression of light, form, and feeling.",
    primaryButtonText: settings?.heroPrimaryButtonText || "Explore Gallery",
    secondaryButtonText: settings?.heroSecondaryButtonText || "Get in Touch",
  };
};
