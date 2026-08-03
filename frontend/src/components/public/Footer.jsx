import { Link } from "react-router-dom";
import { useSettings } from "../../hooks/useSettings";
import PublicSocialLinks from "./PublicSocialLinks";

const Footer = () => {
  const { settings } = useSettings();

  return (
    <footer className="bg-charcoal text-white">
      <div className="container-site py-12 md:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          <div>
            <h3 className="mb-4 font-display text-2xl font-light">
              {settings?.websiteTitle || "Artist Portfolio"}
            </h3>
            <p className="text-sm leading-relaxed text-white/50">
              {settings?.websiteDescription ||
                "Original artworks in oil, acrylic, watercolour and mixed media. Each piece is available for inquiry."}
            </p>
          </div>

          <div>
            <p className="eyebrow mb-4 text-gold">Navigate</p>
            <ul className="space-y-2">
              {[
                { to: "/", label: "Home" },
                { to: "/gallery", label: "Gallery" },
                { to: "/about", label: "About" },
                { to: "/contact", label: "Contact" },
              ].map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-white/60 transition-colors duration-200 hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="eyebrow mb-4 text-gold">Connect</p>
            <div className="mb-6 space-y-2">
              {settings?.contactEmail && (
                <a
                  href={`mailto:${settings.contactEmail}`}
                  className="block text-sm text-white/60 transition-colors hover:text-white"
                >
                  {settings.contactEmail}
                </a>
              )}
              {settings?.contactPhone && (
                <a
                  href={`tel:${settings.contactPhone}`}
                  className="block text-sm text-white/60 transition-colors hover:text-white"
                >
                  {settings.contactPhone}
                </a>
              )}
            </div>
            <PublicSocialLinks tone="dark" />
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 md:flex-row">
          <p className="text-xs text-white/30">
            {settings?.footerText || "(c) 2026 Artist Portfolio. All rights reserved."}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
