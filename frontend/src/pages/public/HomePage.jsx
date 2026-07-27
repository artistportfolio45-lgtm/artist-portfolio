// pages/public/HomePage.jsx
// Landing page: hero + featured artworks + about preview + CTA

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import ArtworkCard from "../../components/public/ArtworkCard";
import ArtworkPreviewModal from "../../components/public/ArtworkPreviewModal";
import { publicDataAPI } from "../../services/publicData";
import { useSettings } from "../../hooks/useSettings";

const HomePage = () => {
  const { settings } = useSettings();
  const [featured, setFeatured] = useState([]);
  const [latestArtworks, setLatestArtworks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [previewArtwork, setPreviewArtwork] = useState(null);

  useEffect(() => {
    Promise.allSettled([
      publicDataAPI.getArtworks(
        { featured: "true", limit: 6 },
        { onLiveData: (res) => setFeatured(res.items || []) }
      ),
      publicDataAPI.getArtworks(
        { limit: 8 },
        { onLiveData: (res) => setLatestArtworks(res.items || []) }
      ),
      publicDataAPI.getProfile({ onLiveData: setProfile }),
    ])
      .then(([featuredRes, latestRes, profileRes]) => {
        if (featuredRes.status === "fulfilled") {
          setFeatured(featuredRes.value.items || []);
        }

        if (latestRes.status === "fulfilled") {
          setLatestArtworks(latestRes.value.items || []);
        }

        if (profileRes.status === "fulfilled") {
          setProfile(profileRes.value);
        }
      })
      .catch(console.error)
  }, []);

  return (
    <PublicLayout>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="relative min-h-screen flex items-center justify-center bg-charcoal overflow-hidden"
        aria-label="Hero"
      >
        {/* Background texture */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 30% 70%, #C9A84C 0%, transparent 60%)" }}
        />

        <div className="container-site text-center relative z-10 py-32 animate-fade-in">
          <p className="eyebrow text-gold mb-6">{settings?.heroEyebrow || "Original Fine Art"}</p>
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-light text-white leading-tight mb-8">
            {settings?.heroHeading || "Art That"}
            <br />
            <em className="italic">{settings?.heroHeadingAccent || "Speaks"}</em>
          </h1>
          <p className="text-white/50 text-lg md:text-xl font-light max-w-lg mx-auto mb-12 leading-relaxed">
            {settings?.heroSubtitle || "Explore a collection of original paintings — each a singular expression of light, form, and feeling."}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/gallery" className="btn-gold">
              {settings?.heroPrimaryButtonText || "Explore Gallery"}
            </Link>
            <Link to="/contact" className="btn-secondary border-white/30 text-white hover:bg-white hover:text-charcoal">
              {settings?.heroSecondaryButtonText || "Get in Touch"}
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30">
          <span className="text-xs font-label tracking-widest uppercase">Scroll</span>
          <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* ── Featured Artworks ─────────────────────────────────── */}
      <section className="section bg-ivory" aria-label="Featured Artworks">
        <div className="container-site">
          <div className="text-center mb-12">
            <p className="eyebrow mb-3">Curated Selection</p>
            <h2 className="font-display text-4xl md:text-5xl font-light text-charcoal">
              Featured Works
            </h2>
          </div>

          {featured.length === 0 ? (
            <div className="text-center py-16 text-slate/50">
              <p className="font-display text-2xl mb-2">No featured artworks yet</p>
              <p className="text-sm">Check back soon for new additions</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
              {featured.map((artwork) => (
                <ArtworkCard
                  key={artwork._id}
                  artwork={artwork}
                  onPreview={() => setPreviewArtwork(artwork)}
                />
              ))}
            </div>
          )}

          <div className="text-center mt-12">
            <Link to="/gallery" className="btn-secondary">
              View All Works
            </Link>
          </div>
        </div>
      </section>

      <section className="section bg-white" aria-label="Latest Artworks">
        <div className="container-site">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-12">
            <div>
              <p className="eyebrow mb-3">Recent Additions</p>
              <h2 className="font-display text-4xl md:text-5xl font-light text-charcoal">
                Latest Works
              </h2>
            </div>
            <Link to="/gallery" className="btn-secondary self-start">
              Browse Gallery
            </Link>
          </div>

          {latestArtworks.length === 0 ? (
            <div className="text-center py-16 text-slate/50">
              <p className="font-display text-2xl mb-2">No artworks uploaded yet</p>
              <p className="text-sm">New works will appear here after the admin adds them.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {latestArtworks.map((artwork) => (
                <ArtworkCard
                  key={artwork._id}
                  artwork={artwork}
                  onPreview={() => setPreviewArtwork(artwork)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── About Preview ─────────────────────────────────────── */}
      {profile?.name && (
        <section className="section bg-white" aria-label="About the Artist">
          <div className="container-site">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Photo */}
              <div className="relative">
                {profile.profilePhoto ? (
                  <img
                    src={profile.profilePhoto}
                    alt={profile.name}
                    className="w-full max-w-md mx-auto object-cover aspect-square grayscale hover:grayscale-0 transition-all duration-700"
                  />
                ) : (
                  <div className="w-full max-w-md mx-auto aspect-square bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-300 text-8xl">🎨</span>
                  </div>
                )}
                {/* Gold accent line */}
                <div className="absolute -bottom-4 -right-4 w-2/3 h-2/3 border border-gold/30 -z-10" />
              </div>

              {/* Text */}
              <div>
                <p className="eyebrow mb-4">The Artist</p>
                <h2 className="font-display text-4xl md:text-5xl font-light text-charcoal mb-6">
                  {profile.name}
                </h2>
                <p className="text-slate leading-relaxed mb-8 text-lg font-light">
                  {profile.about
                    ? profile.about.substring(0, 300) + (profile.about.length > 300 ? "…" : "")
                    : ""}
                </p>
                <Link to="/about" className="btn-primary">
                  Read More
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Contact CTA ───────────────────────────────────────── */}
      <section className="py-20 bg-charcoal" aria-label="Contact CTA">
        <div className="container-site text-center">
          <p className="eyebrow text-gold mb-4">Interested in a Piece?</p>
          <h2 className="font-display text-4xl md:text-5xl font-light text-white mb-6">
            Let's Start a Conversation
          </h2>
          <p className="text-white/50 max-w-md mx-auto mb-10 text-lg font-light leading-relaxed">
            Every artwork is available for enquiry. Reach out to discuss availability,
            pricing, and commissions.
          </p>
          <Link to="/contact" className="btn-gold">
            Send an Enquiry
          </Link>
        </div>
      </section>
      <ArtworkPreviewModal artwork={previewArtwork} onClose={() => setPreviewArtwork(null)} />
    </PublicLayout>
  );
};

export default HomePage;
