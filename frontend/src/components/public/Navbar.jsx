import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useSettings } from "../../hooks/useSettings";
import PublicSocialLinks from "./PublicSocialLinks";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/gallery", label: "Gallery" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

const Brand = ({ mobile = false, light = false, settings }) => (
  <Link to="/" className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
    {settings?.logoUrl && (
      <img
        src={settings.logoUrl}
        alt=""
        className={`${mobile ? "h-10 w-10" : "h-14 w-14"} rounded-full object-cover`}
      />
    )}
    <span
      className={`font-display font-medium tracking-wide ${
        mobile ? "text-xl" : "text-2xl leading-tight"
      } ${light ? "text-white" : "text-charcoal"}`}
    >
      {settings?.websiteTitle || "Artist Portfolio"}
    </span>
  </Link>
);

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { settings } = useSettings();
  const location = useLocation();
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);

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
          <Brand settings={settings} />
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
              settings={settings}
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
