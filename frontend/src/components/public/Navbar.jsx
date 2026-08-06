import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useSettings } from "../../hooks/useSettings";
import { publicDataAPI } from "../../services/publicData";
import PublicSocialLinks from "./PublicSocialLinks";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/gallery", label: "Gallery" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
  { to: "/admin/login", label: "Admin" },
];

const Brand = ({ mobile = false, light = false, profile, imageFailed, onImageError }) => {
  const artistName = profile?.name?.trim() || "G. N. Ambe";
  const showPhoto = Boolean(profile?.profilePhoto) && !imageFailed;

  return <Link to="/" className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
    <span className={`${mobile ? "h-10 w-10" : "h-16 w-16"} flex aspect-square flex-none items-center justify-center overflow-hidden rounded-full bg-charcoal text-xs font-semibold tracking-widest text-gold ring-1 ring-gold/25`}>
      {showPhoto ? (
      <img
        src={profile.profilePhoto}
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
      <span className={`block truncate text-[10px] uppercase tracking-widest ${light ? "text-white/65" : "text-slate/55"}`}>
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
  const location = useLocation();
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    publicDataAPI.getProfile({ onLiveData: setProfile }).then(setProfile).catch(() => setProfile(null));
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
              <li key={link.to}>
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
            <Brand
              mobile
              light={!solidMobileHeader}
              profile={profile}
              imageFailed={imageFailed}
              onImageError={() => setImageFailed(true)}
            />

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
          </div>
        </nav>

        {menuOpen && <div
          ref={menuRef}
          id="public-mobile-menu"
          className="overflow-hidden bg-charcoal"
        >
          <ul className="container-site flex flex-col gap-1 py-4">
            {navLinks.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.to === "/"}
                  className={({ isActive }) =>
                    `block px-2 py-3 text-sm font-label uppercase tracking-widest transition-colors ${
                      isActive ? "text-gold" : "text-white/75 hover:text-white"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>}
      </header>
    </>
  );
};

export default Navbar;
