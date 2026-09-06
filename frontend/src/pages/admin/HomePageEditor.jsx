import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import AdminLayout from "../../components/admin/AdminLayout";
import HomeHero from "../../components/public/HomeHero";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { artworkAPI, settingsAPI } from "../../services/api";
import { setCachedSettings } from "../../hooks/useSettings";
import { cloudinaryThumbnailUrl } from "../../utils/imageDelivery";

const MAX_HERO_FILE_SIZE = 12 * 1024 * 1024;
const HERO_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const PREVIEW_MODES = {
  mobile: { label: "Mobile", width: "max-w-[390px]" },
  tablet: { label: "Tablet", width: "max-w-[768px]" },
  desktop: { label: "Desktop", width: "max-w-[1180px]" },
};

const toDraft = (settings = {}) => ({
  ...settings,
  heroEyebrow: settings.heroEyebrow || "Original Fine Art",
  heroHeading: settings.heroHeading || "Art That",
  heroHeadingAccent: settings.heroHeadingAccent || "Speaks",
  heroSubtitle: settings.heroSubtitle || "",
  heroPrimaryButtonText: settings.heroPrimaryButtonText || "Explore Gallery",
  heroSecondaryButtonText: settings.heroSecondaryButtonText || "Get in Touch",
  recentAdditionsArtworkIds: Array.isArray(settings.recentAdditionsArtworkIds) ? settings.recentAdditionsArtworkIds.map(String) : [],
  heroBackgroundSource: settings.heroBackground?.source || settings.heroBackgroundSource || "none",
  heroBackgroundArtworkId:
    settings.heroBackground?.artworkId || settings.heroBackgroundArtworkId || "",
  heroBackgroundAltText:
    settings.heroBackground?.altText || settings.heroBackgroundAltText || "",
  heroBackgroundPosition:
    settings.heroBackground?.position || settings.heroBackgroundPosition || "center",
  heroOverlayOpacity: Number(
    settings.heroBackground?.overlayOpacity ?? settings.heroOverlayOpacity ?? 0.55
  ),
});

const cloneDraft = (value) => toDraft(JSON.parse(JSON.stringify(value || {})));

const homePayload = (draft) => ({
  heroEyebrow: draft.heroEyebrow,
  heroHeading: draft.heroHeading,
  heroHeadingAccent: draft.heroHeadingAccent,
  heroSubtitle: draft.heroSubtitle,
  heroPrimaryButtonText: draft.heroPrimaryButtonText,
  heroSecondaryButtonText: draft.heroSecondaryButtonText,
  recentAdditionsArtworkIds: draft.recentAdditionsArtworkIds,
  heroBackgroundSource: draft.heroBackgroundSource,
  heroBackgroundArtworkId: draft.heroBackgroundArtworkId || "",
  heroBackgroundAltText: draft.heroBackgroundAltText,
  heroBackgroundPosition: draft.heroBackgroundPosition,
  heroOverlayOpacity: draft.heroOverlayOpacity,
});

const loadAllArtworks = async () => {
  const first = await artworkAPI.getAll({ page: 1, limit: 200 });
  const items = [...(first.data.artworks || [])];
  const pages = first.data.pagination?.pages || 1;
  for (let page = 2; page <= pages; page += 1) {
    const response = await artworkAPI.getAll({ page, limit: 200 });
    items.push(...(response.data.artworks || []));
  }
  return items.filter(
    (artwork) =>
      !["draft", "unpublished", "archived"].includes(artwork.publicationStatus) &&
      artwork.images?.some((image) => image?.url)
  );
};

const Field = ({ label, hint, children }) => (
  <div>
    <label className="mb-1 block text-xs font-label uppercase tracking-widest text-slate/60">
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-xs text-slate/45">{hint}</p>}
  </div>
);

const HomePageEditor = () => {
  const [savedSettings, setSavedSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [artworksLoading, setArtworksLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [artworkError, setArtworkError] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState("");
  const [previewMode, setPreviewMode] = useState("mobile");
  const [showArtworkPicker, setShowArtworkPicker] = useState(false);
  const [artworkSearch, setArtworkSearch] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    settingsAPI.getHome()
      .then((response) => {
        if (!active) return;
        const next = toDraft(response.data.settings);
        setSavedSettings(next);
        setDraft(cloneDraft(next));
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.response?.data?.message || "Failed to load Home Page settings");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    loadAllArtworks()
      .then((items) => {
        if (active) setArtworks(items);
      })
      .catch((requestError) => {
        if (active) setArtworkError(requestError.response?.data?.message || "Artwork collection could not be loaded");
      })
      .finally(() => {
        if (active) setArtworksLoading(false);
      });

    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
  }, [pendingPreviewUrl]);

  const filteredArtworks = useMemo(() => {
    const query = artworkSearch.trim().toLowerCase();
    return query ? artworks.filter((artwork) =>
      [artwork.title, artwork.category, artwork.medium, artwork.year]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    ) : artworks;
  }, [artworkSearch, artworks]);

  const setField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
    setSuccess("");
  };

  const clearPendingFile = () => {
    setPendingFile(null);
    setPendingPreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!HERO_FILE_TYPES.has(file.type)) {
      setError("Choose a JPG, PNG, WebP, or AVIF image");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_HERO_FILE_SIZE) {
      setError("Hero background images must be 12 MB or smaller");
      event.target.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPendingFile(file);
    setPendingPreviewUrl(objectUrl);
    setShowArtworkPicker(false);
    setDraft((current) => ({
      ...current,
      heroBackgroundSource: "upload",
      heroBackgroundArtworkId: "",
      heroBackground: {
        source: "upload",
        url: objectUrl,
        altText: current.heroBackgroundAltText || "",
        position: current.heroBackgroundPosition,
        overlayOpacity: current.heroOverlayOpacity,
      },
    }));
    setError("");
    setSuccess("");
  };

  const selectArtwork = (artwork) => {
    const image = artwork.images.find((item) => item?.url);
    clearPendingFile();
    setDraft((current) => ({
      ...current,
      heroBackgroundSource: "artwork",
      heroBackgroundArtworkId: artwork._id,
      heroBackgroundAltText: artwork.title || "Artwork selected for the Home Hero",
      heroBackground: {
        source: "artwork",
        url: image.url,
        artworkId: artwork._id,
        artworkTitle: artwork.title,
        width: image.width,
        height: image.height,
        altText: artwork.title || "Artwork selected for the Home Hero",
        position: current.heroBackgroundPosition,
        overlayOpacity: current.heroOverlayOpacity,
      },
    }));
    setShowArtworkPicker(false);
    setError("");
    setSuccess("");
  };

  const toggleRecentArtwork = (artworkId) => {
    setDraft((current) => {
      const ids = current.recentAdditionsArtworkIds || [];
      const next = ids.includes(artworkId) ? ids.filter((id) => id !== artworkId) : [...ids, artworkId];
      return { ...current, recentAdditionsArtworkIds: next };
    });
    setError("");
    setSuccess("");
  };

  const handleRecentArtworkClick = (event, artworkId) => {
    event.preventDefault();
    const scrollTop = window.scrollY;
    toggleRecentArtwork(artworkId);
    requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: "auto" }));
  };

  const removeBackground = () => {
    clearPendingFile();
    setDraft((current) => ({
      ...current,
      heroBackgroundSource: "none",
      heroBackgroundArtworkId: "",
      heroBackgroundAltText: "",
      heroBackground: null,
    }));
    setShowArtworkPicker(false);
    setError("");
    setSuccess("Background will be removed when you save.");
  };

  const updateBackgroundControl = (field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
      heroBackground: current.heroBackground ? {
        ...current.heroBackground,
        ...(field === "heroBackgroundAltText" ? { altText: value } : {}),
        ...(field === "heroBackgroundPosition" ? { position: value } : {}),
        ...(field === "heroOverlayOpacity" ? { overlayOpacity: Number(value) } : {}),
      } : null,
    }));
    setError("");
    setSuccess("");
  };

  const handleCancel = () => {
    clearPendingFile();
    setDraft(cloneDraft(savedSettings));
    setShowArtworkPicker(false);
    setArtworkSearch("");
    setError("");
    setSuccess("Unsaved changes discarded.");
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (draft.heroBackgroundSource !== "none" && !draft.heroBackgroundAltText.trim()) {
      setError("Background alt text is required when an image is selected");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = homePayload(draft);
      let response;
      if (pendingFile) {
        const formData = new FormData();
        formData.append("image", pendingFile);
        Object.entries(payload).forEach(([key, value]) => formData.append(key, String(value ?? "")));
        response = await settingsAPI.uploadHomeBackground(formData);
      } else {
        response = await settingsAPI.updateHome(payload);
      }

      const next = toDraft(response.data.settings);
      clearPendingFile();
      setSavedSettings(next);
      setDraft(cloneDraft(next));
      setCachedSettings(response.data.settings);
      setSuccess(response.data.message || "Home Page saved successfully");
      toast.success(response.data.message || "Home Page saved");
    } catch (requestError) {
      const message = requestError.response?.data?.message || "Failed to save Home Page settings";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <AdminLayout><div className="flex p-8 justify-center"><LoadingSpinner size="lg" /></div></AdminLayout>;
  }

  if (!draft) {
    return (
      <AdminLayout>
        <div className="p-6 md:p-8">
          <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        </div>
      </AdminLayout>
    );
  }

  const currentBackground = draft.heroBackground;
  const previewWidth = PREVIEW_MODES[previewMode].width;

  return (
    <AdminLayout>
      <form onSubmit={handleSave} className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 md:p-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-1 text-xs font-label uppercase tracking-widest text-slate/50">Admin</p>
            <h1 className="font-display text-3xl font-light text-charcoal">Home Page</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate/60">
              Manage the Home Hero content and its dedicated background independently from Recent Additions and Featured Works.
            </p>
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-secondary" disabled={saving} onClick={handleCancel}>Cancel</button>
            <button type="submit" className="btn-primary min-w-28" disabled={saving}>
              {saving ? <span className="flex items-center justify-center gap-2"><LoadingSpinner size="sm" light />Saving...</span> : "Save"}
            </button>
          </div>
        </header>

        {error && <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {success && <div role="status" className="border border-green-200 bg-green-50 p-4 text-sm text-green-800">{success}</div>}

        <section className="bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-2 font-display text-xl font-light">Recent Additions</h2>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate/60">Choose any number of published artworks to show on the Home Page. Selected: {draft.recentAdditionsArtworkIds.length}.</p>
            {draft.recentAdditionsArtworkIds.length > 0 && (
              <button type="button" className="text-xs uppercase tracking-wider text-red-700 underline" onClick={() => setField("recentAdditionsArtworkIds", [])}>
                Clear selection
              </button>
            )}
          </div>
          <input className="input-field mb-4" type="search" placeholder="Search artworks" value={artworkSearch} onChange={(event) => setArtworkSearch(event.target.value)} />
          {artworksLoading ? <div className="flex justify-center py-8"><LoadingSpinner /></div> : artworkError ? <p role="alert" className="py-4 text-sm text-red-700">{artworkError}</p> : (
            <div className="grid max-h-[430px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
              {filteredArtworks.map((artwork) => {
                const image = artwork.images.find((item) => item?.url);
                const selected = draft.recentAdditionsArtworkIds.includes(String(artwork._id));
                return <button key={artwork._id} type="button" aria-pressed={selected} className={`overflow-hidden border bg-white text-left transition ${selected ? "border-gold ring-2 ring-gold/30" : "border-gray-200 hover:border-gold"}`} onClick={(event) => handleRecentArtworkClick(event, String(artwork._id))}>
                  <img src={cloudinaryThumbnailUrl(image.url, 320)} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  <span className="block truncate p-2 text-xs text-charcoal">{artwork.title || "Untitled"}{selected ? " (Selected)" : ""}</span>
                </button>;
              })}
            </div>
          )}
        </section>

        <section className="bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-5 font-display text-xl font-light">Hero Content</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Eyebrow"><input className="input-field" maxLength={100} value={draft.heroEyebrow} onChange={(event) => setField("heroEyebrow", event.target.value)} /></Field>
            <Field label="Heading"><input className="input-field" maxLength={140} value={draft.heroHeading} onChange={(event) => setField("heroHeading", event.target.value)} /></Field>
            <Field label="Accent heading"><input className="input-field" maxLength={140} value={draft.heroHeadingAccent} onChange={(event) => setField("heroHeadingAccent", event.target.value)} /></Field>
            <Field label="Explore Gallery button"><input className="input-field" maxLength={80} value={draft.heroPrimaryButtonText} onChange={(event) => setField("heroPrimaryButtonText", event.target.value)} /></Field>
            <Field label="Get in Touch button"><input className="input-field" maxLength={80} value={draft.heroSecondaryButtonText} onChange={(event) => setField("heroSecondaryButtonText", event.target.value)} /></Field>
            <div className="md:col-span-2"><Field label="Subtitle"><textarea className="input-field min-h-28 resize-y" maxLength={600} value={draft.heroSubtitle} onChange={(event) => setField("heroSubtitle", event.target.value)} /></Field></div>
          </div>
        </section>

        <section className="bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="font-display text-xl font-light">Hero Background</h2>
            <p className="mt-1 text-sm text-slate/60">No artwork is selected automatically. With no selection, the existing charcoal and gold fallback is used.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-label uppercase tracking-widest text-slate/60">Current background preview</p>
                <div className="relative aspect-[16/9] overflow-hidden bg-charcoal">
                  {currentBackground?.url ? (
                    <>
                      <img src={cloudinaryThumbnailUrl(currentBackground.url, 960)} alt={draft.heroBackgroundAltText} className="h-full w-full object-cover" style={{ objectPosition: draft.heroBackgroundPosition }} />
                      <div className="absolute inset-0 bg-black" style={{ opacity: draft.heroOverlayOpacity }} />
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/65">Safe default background</div>
                  )}
                  <span className="absolute bottom-3 left-3 z-10 bg-black/65 px-2 py-1 text-xs uppercase tracking-widest text-white">
                    {draft.heroBackgroundSource === "none" ? "Default" : draft.heroBackgroundSource}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="btn-secondary cursor-pointer text-xs">
                  {draft.heroBackgroundSource === "upload" ? "Upload/Replace Photo" : "Upload Photo"}
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleFile} />
                </label>
                <button type="button" className="btn-secondary text-xs" onClick={() => setShowArtworkPicker((open) => !open)}>Select Existing Artwork</button>
                <button type="button" className="min-h-11 border border-red-200 px-5 text-xs uppercase tracking-wider text-red-700 transition hover:bg-red-50" disabled={draft.heroBackgroundSource === "none"} onClick={removeBackground}>Remove Background</button>
              </div>
              <p className="text-xs text-slate/50">JPG, PNG, WebP, or AVIF. Maximum 12 MB.</p>

              {showArtworkPicker && (
                <div className="border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg font-light">Artwork Collection</h3>
                    <button type="button" className="text-sm text-slate underline" onClick={() => setShowArtworkPicker(false)}>Close</button>
                  </div>
                  <input className="input-field mb-4" type="search" placeholder="Search artworks" value={artworkSearch} onChange={(event) => setArtworkSearch(event.target.value)} />
                  {artworksLoading ? <div className="flex justify-center py-8"><LoadingSpinner /></div> : artworkError ? <p role="alert" className="py-4 text-sm text-red-700">{artworkError}</p> : filteredArtworks.length === 0 ? <p className="py-4 text-sm text-slate/60">No published artworks with images found.</p> : (
                    <div className="grid max-h-[430px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
                      {filteredArtworks.map((artwork) => {
                        const image = artwork.images.find((item) => item?.url);
                        const selected = String(draft.heroBackgroundArtworkId) === String(artwork._id);
                        return (
                          <button key={artwork._id} type="button" aria-pressed={selected} className={`overflow-hidden border bg-white text-left transition ${selected ? "border-gold ring-2 ring-gold/30" : "border-gray-200 hover:border-gold"}`} onClick={() => selectArtwork(artwork)}>
                            <img src={cloudinaryThumbnailUrl(image.url, 320)} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                            <span className="block truncate p-2 text-xs text-charcoal">{artwork.title || "Untitled"}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-5">
              <Field label="Background alt text" hint="Required for an uploaded photo or selected artwork.">
                <textarea className="input-field min-h-24 resize-y" maxLength={240} disabled={draft.heroBackgroundSource === "none"} value={draft.heroBackgroundAltText} onChange={(event) => updateBackgroundControl("heroBackgroundAltText", event.target.value)} />
              </Field>
              <Field label="Image position">
                <select className="input-field capitalize" disabled={draft.heroBackgroundSource === "none"} value={draft.heroBackgroundPosition} onChange={(event) => updateBackgroundControl("heroBackgroundPosition", event.target.value)}>
                  {["center", "top", "bottom", "left", "right"].map((position) => <option key={position} value={position}>{position}</option>)}
                </select>
              </Field>
              <Field label={`Overlay darkness: ${Math.round(draft.heroOverlayOpacity * 100)}%`} hint="The minimum 20% overlay protects text readability.">
                <input className="w-full accent-gold" type="range" min="0.2" max="0.9" step="0.05" value={draft.heroOverlayOpacity} onChange={(event) => updateBackgroundControl("heroOverlayOpacity", Number(event.target.value))} />
              </Field>
            </div>
          </div>
        </section>

        <section className="bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-light">Responsive Preview</h2>
              <p className="mt-1 text-sm text-slate/60">Preview the same Hero at its mobile, tablet, and desktop layouts.</p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Hero preview size">
              {Object.entries(PREVIEW_MODES).map(([mode, config]) => (
                <button key={mode} type="button" aria-pressed={previewMode === mode} className={`min-h-10 px-4 text-xs uppercase tracking-wider ${previewMode === mode ? "bg-charcoal text-white" : "border border-gray-200 text-charcoal"}`} onClick={() => setPreviewMode(mode)}>{config.label}</button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto bg-gray-100 p-3 sm:p-5">
            <div className={`mx-auto w-full overflow-hidden shadow-xl ${previewWidth}`} data-preview-viewport={previewMode}>
              <div className="pointer-events-none">
                <HomeHero settings={draft} previewMode={previewMode} showScrollIndicator={false} />
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" disabled={saving} onClick={handleCancel}>Cancel</button>
          <button type="submit" className="btn-primary min-w-32" disabled={saving}>{saving ? "Saving..." : "Save Home Page"}</button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default HomePageEditor;
