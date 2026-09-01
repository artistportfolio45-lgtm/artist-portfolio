// pages/admin/SettingsPage.jsx
// Edit global website settings: title, logo, footer, contact info, social links

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import { settingsAPI } from "../../services/api";
import { setCachedSettings } from "../../hooks/useSettings";
import { useWebsiteTheme } from "../../hooks/useWebsiteTheme";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import { getThemePreset, themePresets } from "../../themePresets";

const themeColorFields = [
  { key: "primaryColor", label: "Primary" },
  { key: "secondaryColor", label: "Secondary" },
  { key: "accentColor", label: "Accent" },
  { key: "backgroundColor", label: "Page Background" },
  { key: "surfaceColor", label: "Cards / Panels" },
  { key: "textColor", label: "Main Text" },
  { key: "mutedTextColor", label: "Muted Text" },
  { key: "borderColor", label: "Borders" },
];

const SettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef();

  useWebsiteTheme(settings);

  useEffect(() => {
    settingsAPI.get()
      .then((res) => {
        setSettings(res.data.settings);
        setCachedSettings(res.data.settings);
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  // Generic field setter
  const set = (key, value) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const applyPreset = (presetId) => {
    const preset = getThemePreset(presetId);
    setSettings((prev) => ({
      ...prev,
      themePreset: preset.id,
      themeMode: preset.mode,
      ...preset.values,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await settingsAPI.update({
        websiteTitle:   settings.websiteTitle,
        websiteDescription: settings.websiteDescription,
        footerText:     settings.footerText,
        themePreset:    settings.themePreset,
        primaryColor:   settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        accentColor:    settings.accentColor,
        backgroundColor: settings.backgroundColor,
        surfaceColor:   settings.surfaceColor,
        textColor:      settings.textColor,
        mutedTextColor: settings.mutedTextColor,
        borderColor:    settings.borderColor,
        buttonRadius:   settings.buttonRadius,
        cardRadius:     settings.cardRadius,
        themeMode:      settings.themeMode,
        maintenanceMode: settings.maintenanceMode,
        seoTitle:       settings.seoTitle,
        seoDescription: settings.seoDescription,
        seoKeywords:    settings.seoKeywords,
        contactEmail:   settings.contactEmail,
        contactPhone:   settings.contactPhone,
        contactAddress: settings.contactAddress,
        instagram:      settings.instagram,
        facebook:       settings.facebook,
        youtube:        settings.youtube,
        whatsapp:       settings.whatsapp,
        expectedResponseTime: settings.expectedResponseTime,
        privacyReassurance: settings.privacyReassurance,
        studioVisitInformation: settings.studioVisitInformation,
        additionalSocialLinks: settings.additionalSocialLinks || [],
      });
      setSettings(res.data.settings);
      setCachedSettings(res.data.settings);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await settingsAPI.uploadLogo(formData);
      setSettings(res.data.settings);
      setCachedSettings(res.data.settings);
      toast.success("Logo updated");
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setUploadingLogo(false);
      logoRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8 flex justify-center"><LoadingSpinner size="lg" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 md:p-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-1">Admin</p>
          <h1 className="font-display text-3xl font-light text-charcoal">Website Settings</h1>
        </div>

        {/* ── Logo ────────────────────────────────────────────── */}
        <div className="bg-white p-6 shadow-sm mb-6">
          <h2 className="font-display text-xl font-light mb-4">Logo</h2>
          <div className="flex items-center gap-6">
            {/* Preview */}
            <div className="w-24 h-24 bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden rounded-full flex-shrink-0">
              {settings?.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt="Logo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-gray-300 text-2xl">🖼</span>
              )}
            </div>

            {/* Upload btn */}
            <div>
              <label className="cursor-pointer btn-secondary text-xs inline-block">
                {uploadingLogo ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" />Uploading…
                  </span>
                ) : (
                  "Upload Logo"
                )}
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </label>
              <p className="text-xs text-slate/40 mt-2">
                SVG, PNG, or WebP. Transparent background recommended.
              </p>
            </div>
          </div>
        </div>

        {/* ── Settings Form ────────────────────────────────────── */}
        <form onSubmit={handleSave} className="space-y-6">
          {/* General */}
          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-4">General</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Website Title
                </label>
                <input
                  type="text"
                  value={settings?.websiteTitle || ""}
                  onChange={(e) => set("websiteTitle", e.target.value)}
                  className="input-field"
                  placeholder="e.g. Priya Sharma — Fine Art"
                />
                <p className="text-xs text-slate/40 mt-1">
                  Shown in the browser tab and navbar
                </p>
              </div>

              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Website Description
                </label>
                <textarea
                  value={settings?.websiteDescription || ""}
                  onChange={(e) => set("websiteDescription", e.target.value)}
                  className="input-field min-h-[96px] resize-y"
                  placeholder="A short public description of the artist portfolio."
                />
              </div>

              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Footer Text
                </label>
                <input
                  type="text"
                  value={settings?.footerText || ""}
                  onChange={(e) => set("footerText", e.target.value)}
                  className="input-field"
                  placeholder="© 2025 Artist Name. All rights reserved."
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-2">Home Page</h2>
            <p className="mb-4 text-sm text-slate/60">
              Hero content, background selection, overlay, positioning, and responsive previews now have a dedicated editor.
            </p>
            <Link to="/admin/home-page" className="btn-secondary inline-block text-xs">Open Home Page Editor</Link>
          </div>

          {/* Theme */}
          <div className="bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 mb-5">
              <h2 className="font-display text-xl font-light">Website Theme</h2>
              <p className="text-sm text-slate/60">
                Choose a full preset, then adjust every color and shape used by the public website.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
              {themePresets.map((preset) => {
                const selected = (settings?.themePreset || "gallery-light") === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className={`text-left border p-4 transition-all ${
                      selected ? "border-gold ring-1 ring-gold" : "border-gray-200 hover:border-charcoal/40"
                    }`}
                  >
                    <div className="flex gap-1 mb-3">
                      {[
                        preset.values.backgroundColor,
                        preset.values.surfaceColor,
                        preset.values.textColor,
                        preset.values.accentColor,
                      ].map((color) => (
                        <span
                          key={color}
                          className="h-6 w-6 border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <span className="block text-sm font-medium text-charcoal">{preset.name}</span>
                    <span className="block text-xs text-slate/50 mt-1 leading-relaxed">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {themeColorFields.map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                    {label}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings?.[key] || "#000000"}
                      onChange={(e) => set(key, e.target.value)}
                      className="h-11 w-12 border border-gray-200 bg-white p-1"
                      aria-label={`${label} color`}
                    />
                    <input
                      type="text"
                      value={settings?.[key] || ""}
                      onChange={(e) => set(key, e.target.value)}
                      className="input-field"
                      placeholder="#000000"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Theme Mode
                </label>
                <select
                  value={settings?.themeMode || "light"}
                  onChange={(e) => set("themeMode", e.target.value)}
                  className="input-field"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="contrast">High Contrast</option>
                </select>
              </div>

              {[
                { key: "buttonRadius", label: "Button Shape", min: 0, max: 24 },
                { key: "cardRadius", label: "Card Shape", min: 0, max: 24 },
              ].map(({ key, label, min, max }) => {
                const numericValue = parseInt(settings?.[key] || "0", 10) || 0;
                return (
                  <div key={key}>
                    <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                      {label}
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={numericValue}
                        onChange={(e) => set(key, `${e.target.value}px`)}
                        className="w-full accent-gold"
                      />
                      <span className="w-12 text-right text-xs text-slate/60">{numericValue}px</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className="mt-6 border p-5"
              style={{
                backgroundColor: settings?.backgroundColor || "#F8F5F0",
                borderColor: settings?.borderColor || "#E8E8E8",
                color: settings?.textColor || "#1C1C1E",
              }}
            >
              <div
                className="p-5 shadow-sm"
                style={{
                  backgroundColor: settings?.surfaceColor || "#FFFFFF",
                  borderRadius: settings?.cardRadius || "0px",
                }}
              >
                <p className="text-xs font-label tracking-widest uppercase mb-2" style={{ color: settings?.accentColor || "#C9A84C" }}>
                  Live Theme Preview
                </p>
                <h3 className="font-display text-2xl font-light mb-2">Artwork Collection</h3>
                <p className="text-sm mb-4" style={{ color: settings?.mutedTextColor || "#4A4A5A" }}>
                  This preview shows background, surface, text, muted text, accent, and button shape.
                </p>
                <button
                  type="button"
                  className="px-5 py-2 text-xs font-label tracking-widest uppercase"
                  style={{
                    backgroundColor: settings?.textColor || "#1C1C1E",
                    color: settings?.backgroundColor || "#F8F5F0",
                    borderRadius: settings?.buttonRadius || "0px",
                  }}
                >
                  View Gallery
                </button>
              </div>
            </div>
          </div>

          {/* SEO */}
          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-4">SEO</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  SEO Title
                </label>
                <input
                  type="text"
                  value={settings?.seoTitle || ""}
                  onChange={(e) => set("seoTitle", e.target.value)}
                  className="input-field"
                  placeholder="Artist Name - Original Paintings and Fine Art"
                />
              </div>

              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  SEO Description
                </label>
                <textarea
                  value={settings?.seoDescription || ""}
                  onChange={(e) => set("seoDescription", e.target.value)}
                  className="input-field min-h-[96px] resize-y"
                  placeholder="A concise search result description for the portfolio."
                />
              </div>

              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  SEO Keywords
                </label>
                <input
                  type="text"
                  value={settings?.seoKeywords || ""}
                  onChange={(e) => set("seoKeywords", e.target.value)}
                  className="input-field"
                  placeholder="artist, paintings, gallery, original art"
                />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-4">Contact Information</h2>
            <div className="space-y-4">
              {[
                { key: "contactEmail", label: "Contact Email", type: "email", placeholder: "hello@artist.com" },
                { key: "contactPhone", label: "Contact Phone", type: "tel", placeholder: "+91 98765 43210" },
                { key: "contactAddress", label: "Address / Location", type: "text", placeholder: "Mumbai, India" },
                { key: "expectedResponseTime", label: "Expected response time", type: "text", placeholder: "Usually within 2 business days" },
                { key: "privacyReassurance", label: "Privacy reassurance", type: "text", placeholder: "Your details are used only to respond to this enquiry." },
                { key: "studioVisitInformation", label: "Studio visit information", type: "text", placeholder: "Visits by appointment only" },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                    {label}
                  </label>
                  <input
                    type={type}
                    value={settings?.[key] || ""}
                    onChange={(e) => set(key, e.target.value)}
                    className="input-field"
                    placeholder={placeholder}
                  />
                </div>
              ))}
              {(settings?.additionalSocialLinks || []).map((link, index) => (
                <div key={`${index}-${link.url}`} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                  <input className="input-field" aria-label={`Additional social link ${index + 1} label`} placeholder="Label" value={link.label || ""} onChange={(event) => set("additionalSocialLinks", settings.additionalSocialLinks.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
                  <input className="input-field" type="url" aria-label={`Additional social link ${index + 1} URL`} placeholder="https://" value={link.url || ""} onChange={(event) => set("additionalSocialLinks", settings.additionalSocialLinks.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} />
                  <button type="button" className="min-h-11 px-3 text-sm text-red-600" onClick={() => set("additionalSocialLinks", settings.additionalSocialLinks.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn-secondary text-xs" onClick={() => set("additionalSocialLinks", [...(settings?.additionalSocialLinks || []), { label: "", url: "" }])}>Add social link</button>
            </div>
          </div>

          {/* Social Links */}
          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-4">Social Links</h2>
            <p className="text-xs text-slate/50 mb-4">
              Enter full URLs (e.g. https://instagram.com/yourhandle)
            </p>
            <div className="space-y-4">
              {[
                { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourhandle" },
                { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourpage" },
                { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourchannel" },
                { key: "whatsapp", label: "WhatsApp Number", placeholder: "919876543210 (with country code, no +)" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                    {label}
                  </label>
                  <input
                    type="text"
                    value={settings?.[key] || ""}
                    onChange={(e) => set(key, e.target.value)}
                    className="input-field"
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Save */}
          <div>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saving
                ? <><LoadingSpinner size="sm" light />Saving…</>
                : "Save Settings"
              }
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default SettingsPage;
