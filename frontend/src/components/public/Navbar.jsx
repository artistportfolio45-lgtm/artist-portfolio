import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useSettings } from "../../hooks/useSettings";
import { publicDataAPI } from "../../services/publicData";
import { subscribeToArtworkRefresh } from "../../services/artworkRefresh";
import { cloudinaryThumbnailUrl } from "../../utils/imageDelivery";
import PublicSocialLinks from "./PublicSocialLinks";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/gallery", label: "Gallery" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];
const GALLERY_PAGE_SIZE = 50;

const Brand = ({ mobile = false, light = false, profile, imageFailed, onImageError }) => {
  const artistName = profile?.name?.trim() || "G. N. Ambe";
  const showPhoto = Boolean(profile?.profilePhoto) && !imageFailed;

  return <Link to="/" className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
    <span className={`${mobile ? "h-10 w-10" : "h-16 w-16"} flex aspect-square flex-none items-center justify-center overflow-hidden rounded-full bg-charcoal text-xs font-semibold tracking-widest text-gold ring-1 ring-gold/25`}>
      {showPhoto ? (
      <img
        src={cloudinaryThumbnailUrl(profile.profilePhoto, mobile ? 96 : 160)}
        srcSet={`${cloudinaryThumbnailUrl(profile.profilePhoto, 96)} 96w, ${cloudinaryThumbnailUrl(profile.profilePhoto, 160)} 160w`}
        sizes={mobile ? "40px" : "64px"}
        alt={`${artistName} portrait`}
        className="h-full w-full object-cover"
        onError={onImageError}
      />
      ) : "GNA"}
    </span>
    <span className="min-w-0">
      <span className={`block truncate font-display font-medium ${mobile ? "text-lg" : "text-xl leading-tight"} ${light ? "text-white" : "text-charcoal"}`}>
        {artistName}
      </span>
      <span className={`block truncate text-[10px] uppercase tracking-widest ${light ? "text-white/80" : "text-slate/80"}`}>
        Fine Art Portfolio
      </span>
      {!mobile && <span className="mt-1 block text-[9px] uppercase tracking-widest text-gold">National-Level Artist</span>}
    </span>
  </Link>;
};

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { settings } = useSettings();
  const [profile, setProfile] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [galleryPageCount, setGalleryPageCount] = useState(1);
  const location = useLocation();
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    publicDataAPI.getProfile({ onLiveData: setProfile }).then(setProfile).catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    let active = true;
    const loadGalleryPageCount = () => {
      publicDataAPI.getArtworks({ page: 1, limit: GALLERY_PAGE_SIZE })
        .then((result) => {
          if (!active) return;
          setGalleryPageCount(Math.max(1, Number(result.pagination?.pages) || 1));
        })
        .catch(() => {
          if (active) setGalleryPageCount(1);
        });
    };

    loadGalleryPageCount();
    const unsubscribe = subscribeToArtworkRefresh(loadGalleryPageCount);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => setImageFailed(false), [profile?.profilePhoto]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [menuButtonRef.current, ...menuRef.current.querySelectorAll("a[href]")].filter(Boolean);
    menuRef.current.querySelector("a[href]")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  const lightMobilePage =
    location.pathname === "/gallery" || location.pathname.startsWith("/artwork/");
  const solidMobileHeader = scrolled || lightMobilePage || menuOpen;
  const currentGalleryPage = Math.max(1, Number.parseInt(new URLSearchParams(location.search).get("page"), 10) || 1);
  const galleryPageHref = (pageNumber) => {
    const params = location.pathname === "/gallery"
      ? new URLSearchParams(location.search)
      : new URLSearchParams();
    if (pageNumber === 1) params.delete("page");
    else params.set("page", String(pageNumber));
    const query = params.toString();
    return query ? `/gallery?${query}` : "/gallery";
  };

  return (
    <>
      <aside className="public-sidebar" aria-label="Primary navigation">
        <div>
          <Brand profile={profile} imageFailed={imageFailed} onImageError={() => setImageFailed(true)} />
          {settings?.websiteDescription && (
            <p className="mt-4 line-clamp-3 text-sm font-light leading-relaxed text-slate/55">
              {settings.websiteDescription}
            </p>
          )}
        </div>
 
        <nav className="mt-14">
          <ul className="space-y-1">
            {navLinks.map((link) => (
              <li key={link.to} className={link.to === "/gallery" ? "group/gallery relative" : undefined}>
                <NavLink
                  to={link.to}
                  end={link.to === "/"}
                  className={({ isActive }) =>
                    `group flex min-h-11 items-center justify-between border-b px-1 text-sm transition-colors ${
                      isActive
                        ? "active border-gold text-charcoal"
                        : "border-transparent text-slate/55 hover:text-charcoal"
                    }`
                  }
                >
                  {link.label}
                  <span className="text-gold opacity-0 transition-opacity group-[.active]:opacity-100" aria-hidden="true">
                    —
                  </span>
                </NavLink>
                {link.to === "/gallery" && galleryPageCount > 1 && (
                  <div
                    className="pointer-events-none absolute left-0 top-full z-[70] mt-1 w-full translate-y-1 bg-white p-4 opacity-0 shadow-xl ring-1 ring-charcoal/10 transition-all duration-200 group-hover/gallery:pointer-events-auto group-hover/gallery:translate-y-0 group-hover/gallery:opacity-100 group-focus-within/gallery:pointer-events-auto group-focus-within/gallery:translate-y-0 group-focus-within/gallery:opacity-100"
                    role="group"
                    aria-label="Gallery pages"
                  >
                    <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate/55">Gallery pages</p>
                    <div className="grid max-h-[60vh] grid-cols-4 gap-1 overflow-y-auto">
                      {Array.from({ length: galleryPageCount }, (_, index) => {
                        const pageNumber = index + 1;
                        const isCurrent = location.pathname === "/gallery" && currentGalleryPage === pageNumber;
                        return (
                          <Link
                            key={pageNumber}
                            to={galleryPageHref(pageNumber)}
                            aria-current={isCurrent ? "page" : undefined}
                            className={`flex min-h-10 items-center justify-center border text-xs transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                              isCurrent
                                ? "border-charcoal bg-charcoal text-white"
                                : "border-charcoal/15 text-charcoal hover:border-gold hover:text-gold"
                            }`}
                          >
                            {pageNumber}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>
 
 
        <div className="mt-auto border-t border-charcoal/10 pt-6">
          <PublicSocialLinks compact />
          <p className="mt-5 text-[10px] leading-relaxed text-slate/35">
            {settings?.footerText || "Original artwork and selected projects."}
          </p>
        </div>
      </aside>
 
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 lg:hidden ${
          solidMobileHeader ? "bg-white shadow-sm" : "bg-transparent"
        }`}
      >
        <nav className="container-site" aria-label="Mobile navigation">
          <div className="flex h-16 items-center justify-between md:h-20">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className={`inline-flex h-11 w-11 items-center justify-center transition-colors ${
                solidMobileHeader ? "text-charcoal" : "text-white"
              }`}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="public-mobile-menu"
            >
              <span className="flex w-6 flex-col gap-1.5" aria-hidden="true">
                <span className={`block h-0.5 bg-current transition-transform ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
                <span className={`block h-0.5 bg-current transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
                <span className={`block h-0.5 bg-current transition-transform ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
              </span>
            </button>
            <div className="flex-1 flex justify-center">
              <Brand
                mobile
                light={!solidMobileHeader}
                profile={profile}
                imageFailed={imageFailed}
                onImageError={() => setImageFailed(true)}
              />
            </div>
            <div className="h-11 w-11" aria-hidden="true" />
          </div>
        </nav>
 
        {menuOpen && (
          <div
            ref={menuRef}
            id="public-mobile-menu"
            className="fixed inset-0 z-50 overflow-hidden bg-charcoal text-white transition-transform duration-300"
          >
            <div className="container-site flex h-full items-center justify-center px-4 py-8">
              <div className="w-full max-w-sm">
                <p className="mb-5 text-center text-[10px] uppercase tracking-[0.26em] text-white/80">Navigation</p>
                <div className="border-t border-white/15">
                  {navLinks.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.to === "/"}
                      className={({ isActive }) =>
                        `flex min-h-11 items-center justify-between border-b border-white/15 px-1 text-sm uppercase tracking-[0.18em] transition ${
                          isActive ? "text-white" : "text-white/80 hover:text-white"
                        }`
                      }
                    >
                      {link.label}
                      <span aria-hidden="true">&rarr;</span>
                    </NavLink>
                  ))}
                </div>
                <div className="mt-7 flex justify-center"><PublicSocialLinks tone="dark" /></div>
                {settings?.websiteDescription && <p className="mx-auto mt-5 max-w-xs text-center text-xs leading-5 text-white/45">{settings.websiteDescription}</p>}
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="mx-auto mt-7 flex min-h-11 items-center border-b border-white/30 px-2 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:text-white"
                >
                  Close menu
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
};

export default Navbar;
