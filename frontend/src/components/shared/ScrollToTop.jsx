import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const ScrollToTop = () => {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    const restoreState = sessionStorage.getItem("artist-portfolio:gallery-restore");
    const isGalleryRestoreNavigation = pathname === "/gallery" && Boolean(restoreState);
    if (isGalleryRestoreNavigation) {
      return undefined;
    }

    const key = `scroll:${pathname}${search}`;
    const savedPosition = navigationType === "POP" ? Number(sessionStorage.getItem(key)) : 0;
    requestAnimationFrame(() => window.scrollTo({ top: Number.isFinite(savedPosition) ? savedPosition : 0, left: 0, behavior: "auto" }));
    return () => sessionStorage.setItem(key, String(window.scrollY));
  }, [navigationType, pathname, search]);

  return null;
};

export default ScrollToTop;
