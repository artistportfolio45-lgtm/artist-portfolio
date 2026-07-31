// components/public/PublicLayout.jsx

import Navbar from "./Navbar";
import Footer from "./Footer";
import { useEffect, useState } from "react";
import { useSettings } from "../../hooks/useSettings";
import { useWebsiteTheme } from "../../hooks/useWebsiteTheme";

const PublicLayout = ({ children }) => {
  const { settings } = useSettings();
  useWebsiteTheme(settings);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    if (!settings) return;

    const title = settings.seoTitle || settings.websiteTitle || "Artist Portfolio";
    const description = settings.seoDescription || settings.websiteDescription || "";
    const keywords = settings.seoKeywords || "";

    document.title = title;

    const setMeta = (name, content) => {
      let tag = document.querySelector(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    if (description) setMeta("description", description);
    if (keywords) setMeta("keywords", keywords);
  }, [settings]);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 700);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (settings?.maintenanceMode) {
    return (
      <div className="min-h-screen bg-ivory flex items-center justify-center px-6">
        <div className="max-w-xl text-center">
          <p className="eyebrow text-gold mb-4">Maintenance</p>
          <h1 className="font-display text-4xl md:text-5xl font-light text-charcoal mb-5">
            The gallery is being refreshed
          </h1>
          <p className="text-slate leading-relaxed">
            Please check back soon. The artist is updating the portfolio experience.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-shell min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Back to top"
        className={`fixed bottom-5 right-5 z-50 h-11 w-11 bg-charcoal text-white shadow-lg ring-1 ring-white/10 transition-all duration-300 hover:bg-gold ${
          showBackToTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        ↑
      </button>
    </div>
  );
};

export default PublicLayout;
