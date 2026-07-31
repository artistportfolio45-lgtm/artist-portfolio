// pages/public/AboutPage.jsx
// Full artist biography and contact details

import { useState, useEffect } from "react";
import PublicLayout from "../../components/public/PublicLayout";
import { publicDataAPI } from "../../services/publicData";
import { PageLoader } from "../../components/shared/LoadingSpinner";

const AboutPage = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicDataAPI.getProfile()
      .then((data) => setProfile(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <PublicLayout>
        <PageLoader />
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      {/* Header */}
      <div className="bg-charcoal pt-28 pb-16 lg:pt-16 lg:pb-12">
        <div className="container-site text-center">
          <p className="eyebrow text-gold mb-3">The Artist</p>
          <h1 className="font-display text-5xl md:text-6xl font-light text-white">
            {profile?.name || "About"}
          </h1>
        </div>
      </div>

      <section className="section bg-white">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-20">
            {/* Photo column */}
            <div className="lg:col-span-2">
              {profile?.profilePhoto ? (
                <div className="sticky top-24">
                  <img
                    src={profile.profilePhoto}
                    alt={profile.name}
                    className="w-full object-cover aspect-square"
                  />
                  {/* Contact sidebar */}
                  <div className="mt-8 space-y-3">
                    {profile.email && (
                      <a href={`mailto:${profile.email}`}
                        className="flex items-center gap-3 text-sm text-slate hover:text-gold transition-colors">
                        <span className="text-gold">✉</span> {profile.email}
                      </a>
                    )}
                    {profile.phone && (
                      <a href={`tel:${profile.phone}`}
                        className="flex items-center gap-3 text-sm text-slate hover:text-gold transition-colors">
                        <span className="text-gold">☎</span> {profile.phone}
                      </a>
                    )}
                    {profile.address && (
                      <p className="flex items-start gap-3 text-sm text-slate">
                        <span className="text-gold mt-0.5">⌖</span> {profile.address}
                      </p>
                    )}
                  </div>
                  {/* Social links */}
                  <div className="mt-6 flex gap-4 flex-wrap">
                    {profile.instagram && (
                      <a href={profile.instagram} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-label tracking-widest uppercase text-slate/60 hover:text-gold transition-colors">
                        Instagram
                      </a>
                    )}
                    {profile.facebook && (
                      <a href={profile.facebook} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-label tracking-widest uppercase text-slate/60 hover:text-gold transition-colors">
                        Facebook
                      </a>
                    )}
                    {profile.youtube && (
                      <a href={profile.youtube} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-label tracking-widest uppercase text-slate/60 hover:text-gold transition-colors">
                        YouTube
                      </a>
                    )}
                    {profile.whatsapp && (
                      <a href={`https://wa.me/${profile.whatsapp.replace(/\D/g, "")}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs font-label tracking-widest uppercase text-slate/60 hover:text-gold transition-colors">
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
                  <span className="text-gray-300 text-8xl">🎨</span>
                </div>
              )}
            </div>

            {/* Bio column */}
            <div className="lg:col-span-3">
              <p className="eyebrow mb-6">Biography</p>
              {profile?.about ? (
                <div className="font-light text-slate leading-loose text-lg space-y-6">
                  {profile.about.split("\n\n").map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <p className="text-slate/50 font-light text-lg">
                  Artist biography coming soon.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default AboutPage;
