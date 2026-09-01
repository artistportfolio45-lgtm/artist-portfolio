import { useEffect } from "react";
export const applyWebsiteTheme = (settings) => {
  if (!settings || typeof window === "undefined") return false;
  return window.ArtistPortfolioTheme?.apply(settings) === true;
};

export const useWebsiteTheme = (settings) => {
  useEffect(() => {
    if (settings) applyWebsiteTheme(settings);
  }, [settings]);
};
