import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { shouldRestoreGalleryFromDetail } from "../../utils/galleryRestore";

const ScrollToTop = () => {
  const location = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    const restoreStateRaw = sessionStorage.getItem("artist-portfolio:gallery-restore");
    let restoreState = null;
    if (restoreStateRaw) {
      try {
        restoreState = JSON.parse(restoreStateRaw);
      } catch {
        restoreState = null;
      }
    }
    const restoreFromDetail = shouldRestoreGalleryFromDetail(location.state, document.referrer);
    const isGalleryRestoreNavigation =
      location.pathname === "/gallery" &&
      Boolean(restoreState) &&
      (
        (navigationType === "POP" && `${location.pathname}${location.search}` === `${restoreState.pathname}${restoreState.search || ""}`) ||
        restoreFromDetail
      );

    if (isGalleryRestoreNavigation) {
      return undefined;
    }

    const key = `scroll:${location.pathname}${location.search}`;
    const savedPosition = navigationType === "POP" ? Number(sessionStorage.getItem(key)) : 0;
    requestAnimationFrame(() => window.scrollTo({ top: Number.isFinite(savedPosition) ? savedPosition : 0, left: 0, behavior: "auto" }));
    return () => sessionStorage.setItem(key, String(window.scrollY));
  }, [navigationType, location.pathname, location.search, location.state]);

  return null;
};

export default ScrollToTop;
