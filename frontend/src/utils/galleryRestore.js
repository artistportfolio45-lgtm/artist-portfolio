const STORAGE_KEY = "artist-portfolio:gallery-restore";

export const saveGalleryRestoreState = ({ pathname, search, page, artworkId, scrollY, filters }) => {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ pathname, search, page, artworkId, scrollY, filters })
  );
};

export const readGalleryRestoreState = () => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const clearGalleryRestoreState = () => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
};

export const shouldRestoreGalleryFromDetail = (locationState, referrer = "") => {
  if (locationState?.restoreFromArtwork) return true;
  return Boolean(referrer && referrer.includes("/artwork/"));
};

export const normalizeGalleryPage = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
};
