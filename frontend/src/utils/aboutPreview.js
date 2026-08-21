export const PRODUCTION_SITE_ORIGIN = "https://artistportfolio46.netlify.app";
export const LOCAL_SITE_ORIGIN = "http://localhost:5173";

export const buildAboutPreviewUrl = (siteOrigin) => {
  const origin = siteOrigin || (typeof window !== "undefined" ? window.location.origin : PRODUCTION_SITE_ORIGIN);
  return new URL("/about?preview=draft", origin).toString();
};
