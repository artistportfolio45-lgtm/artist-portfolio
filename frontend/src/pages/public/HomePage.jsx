// pages/public/HomePage.jsx
// Landing page: hero + featured artworks + about preview + CTA

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import ArtworkCard from "../../components/public/ArtworkCard";
import ArtworkMasonry from "../../components/public/ArtworkMasonry";
import ArtworkPreviewModal from "../../components/public/ArtworkPreviewModal";
import HomeHero from "../../components/public/HomeHero";
import { publicDataAPI } from "../../services/publicData";
import { subscribeToArtworkRefresh } from "../../services/artworkRefresh";
import { useSettings } from "../../hooks/useSettings";

const HomePage = () => {
  const { settings } = useSettings();
  const [featured, setFeatured] = useState([]);
  const [latestArtworks, setLatestArtworks] = useState([]);
  const [latestLoading, setLatestLoading] = useState(true);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [dataSource, setDataSource] = useState("loading");
  const [profile, setProfile] = useState(null);
  const [featuredPreview, setFeaturedPreview] = useState(null);
  const requestIdRef = useRef(0);

  const fetchHomeData = useCallback(() => {
    const requestId = ++requestIdRef.current;
    let featuredLive = false;
    let latestLive = false;
    setLatestLoading(true);
    setFeaturedLoading(true);

    Promise.allSettled([
      publicDataAPI.getArtworks(
        { featured: "true", limit: 6 },
        { onLiveData: (res) => {
          featuredLive = true;
          if (requestId === requestIdRef.current) {
            setFeatured(res.items || []);
            setDataSource("live");
          }
        } }
      ),
      publicDataAPI.getArtworks(
        { limit: 9 },
        { onLiveData: (res) => {
          latestLive = true;
          if (requestId === requestIdRef.current) {
            setLatestArtworks(res.items || []);
            setDataSource("live");
          }
        } }
      ),
      publicDataAPI.getProfile({ onLiveData: setProfile }),
    ])
      .then(([featuredRes, latestRes, profileRes]) => {
        if (requestId !== requestIdRef.current) return;
        if (featuredRes.status === "fulfilled" && (!featuredLive || featuredRes.value.source === "live")) {
          setFeatured(featuredRes.value.items || []);
          if (featuredRes.value.isStale) setDataSource("static");
        }

        if (latestRes.status === "fulfilled" && (!latestLive || latestRes.value.source === "live")) {
          setLatestArtworks(latestRes.value.items || []);
          if (latestRes.value.isStale) setDataSource("static");
        }

        if (profileRes.status === "fulfilled") {
          setProfile(profileRes.value);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLatestLoading(false);
          setFeaturedLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    fetchHomeData();
    return subscribeToArtworkRefresh(fetchHomeData);
  }, [fetchHomeData]);

  return (
    <PublicLayout>
      {/* Shared responsive Hero: configured independently from artwork lists */}
      <HomeHero settings={settings} />

      {/* ── Featured Artworks ─────────────────────────────────── */}
      <section className="featured-artworks section bg-ivory" aria-label="Featured Artworks">
        <div className="container-site">
          <div className="text-center mb-12">
            <p className="eyebrow mb-3">Curated Selection</p>
            <h2 className="font-display text-4xl md:text-5xl font-light text-charcoal">
              Featured Works
            </h2>
          </div>

          {featuredLoading ? (
            <div role="status" aria-label="Loading featured artworks" className="flex gap-6 overflow-hidden md:gap-8">
              {[0, 1, 2].map((item) => <div key={item} className="aspect-[4/3] w-[86%] flex-none animate-pulse bg-charcoal/5 sm:w-[47%] lg:w-[calc((100%_-_4rem)/3)]" />)}
            </div>
          ) : featured.length === 0 ? (
            <div className="text-center py-16 text-slate/50">
              <p className="font-display text-2xl mb-2">No featured artworks yet</p>
              <p className="text-sm">Check back soon for new additions</p>
            </div>
          ) : (
            <div
              className="flex snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain pb-4 md:gap-8"
              aria-label="Featured artwork carousel"
            >
              {featured.map((artwork, index) => (
                <div key={artwork._id} className="w-[86%] flex-none snap-start sm:w-[47%] lg:w-[calc((100%_-_4rem)/3)]">
                  <ArtworkCard
                    artwork={artwork}
                    variant="featured"
                    priority={index < 3}
                    onPreview={setFeaturedPreview}
                  />
                </div>
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

      <section id="latest-works" className="bg-white py-12 md:py-16" aria-label="Latest Artworks">
        <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-6">
          <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow mb-2">Recent Additions</p>
              <h2 className="font-display text-3xl font-light text-charcoal md:text-4xl">
                Latest Works
              </h2>
            </div>
            <Link
              to="/gallery"
              className="self-start border-b border-gold pb-1 text-sm text-charcoal transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Browse Gallery →
            </Link>
          </div>

          <ArtworkMasonry
            artworks={latestArtworks}
            loading={latestLoading}
            skeletonCount={9}
            priorityCount={3}
            emptyState={
              <div className="py-16 text-center text-slate/50">
                <p className="mb-2 font-display text-2xl">No artworks uploaded yet</p>
                <p className="text-sm">New works will appear here after the admin adds them.</p>
              </div>
            }
          />
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
      {featuredPreview && (
        <ArtworkPreviewModal
          artwork={featuredPreview}
          onClose={() => setFeaturedPreview(null)}
        />
      )}
    </PublicLayout>
  );
};

export default HomePage;
