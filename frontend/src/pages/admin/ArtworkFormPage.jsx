// pages/admin/ArtworkFormPage.jsx
// Shared form for creating a new artwork AND editing an existing one.
// Route: /admin/artworks/new  →  create mode
// Route: /admin/artworks/:id/edit  →  edit mode

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import BackButton from "../../components/shared/BackButton";
import { artworkAPI } from "../../services/api";
import { notifyArtworksChanged } from "../../services/artworkRefresh";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";

// ─── Empty form defaults ──────────────────────────────────────────────────────
const EMPTY_FORM = {
  title: "",
  description: "",
  category: "",
  price: "",
  medium: "",
  dimensions: "",
  collection: "",
  series: "",
  catalogueNumber: "",
  provenance: "",
  exhibitionHistory: "",
  publications: "",
  creationLocation: "",
  tags: "",
  keywords: "",
  publicationStatus: "published",
  allowLongDescription: false,
  year: "",
  isAvailable: true,
  isFeatured: false,
};
const RECOMMENDED_FIELDS = ["title", "category", "price", "medium", "dimensions", "year", "description"];

const ArtworkFormPage = () => {
  const { id } = useParams();           // undefined in create mode
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const clientUploadIdRef = useRef(crypto.randomUUID());
  const uploadBatchIdRef = useRef(crypto.randomUUID());

  const [form, setForm] = useState(EMPTY_FORM);
  const [existingImages, setExistingImages] = useState([]); // already on Cloudinary
  const [newFiles, setNewFiles] = useState([]);              // File objects to upload
  const [previews, setPreviews] = useState([]);              // local blob URLs
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [deletingImg, setDeletingImg] = useState(null);
  const [incompleteWarningShown, setIncompleteWarningShown] = useState(false);
  const [incompleteFields, setIncompleteFields] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const originalPublicationStatusRef = useRef("published");
  const fileInputRef = useRef();
  const fieldRefs = useRef({});

  // ── Load existing artwork when in edit mode ──────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    artworkAPI.getById(id)
      .then((res) => {
        const a = res.data.artwork;
        originalPublicationStatusRef.current = a.publicationStatus || "published";
        setForm({
          title: a.title || "",
          description: a.description || "",
          category: a.category || "",
          price: a.price ?? "",
          medium: a.medium || "",
          dimensions: a.dimensions || "",
          collection: a.collection || "",
          series: a.series || "",
          catalogueNumber: a.catalogueNumber || "",
          provenance: a.provenance || "",
          exhibitionHistory: a.exhibitionHistory || "",
          publications: a.publications || "",
          creationLocation: a.creationLocation || "",
          tags: Array.isArray(a.tags) ? a.tags.join(", ") : a.tags || "",
          keywords: Array.isArray(a.keywords) ? a.keywords.join(", ") : a.keywords || "",
          publicationStatus: a.publicationStatus || "published",
          allowLongDescription: false,
          year: a.year ?? "",
          isAvailable: a.isAvailable,
          isFeatured: a.isFeatured,
        });
        setExistingImages(a.images || []);
      })
      .catch(() => toast.error("Failed to load artwork"))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // ── Cleanup blob URLs on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => previews.forEach(URL.revokeObjectURL);
  }, [previews]);

  // ── File picker handler ──────────────────────────────────────────────────
  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;

    previews.forEach(URL.revokeObjectURL);
    const file = picked[0];
    setNewFiles([file]);
    setPreviews([URL.createObjectURL(file)]);
    // Reset input so same file can be re-picked if removed
    fileInputRef.current.value = "";
  };

  // ── Remove a locally-staged image (not yet uploaded) ────────────────────
  const removeNewFile = (index) => {
    URL.revokeObjectURL(previews[index]);
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Delete an already-uploaded Cloudinary image ──────────────────────────
  const handleDeleteExisting = async (publicId) => {
    if (!window.confirm("Remove this image? This cannot be undone.")) return;
    setDeletingImg(publicId);
    try {
      await artworkAPI.deleteImage(id, publicId);
      setExistingImages((prev) => prev.filter((img) => img.publicId !== publicId));
      toast.success("Image removed");
    } catch {
      toast.error("Failed to remove image");
    } finally {
      setDeletingImg(null);
    }
  };

  // ── Field change helper ──────────────────────────────────────────────────
  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (String(value).trim()) {
      setIncompleteFields((prev) => prev.filter((field) => field !== key));
    }
  };

  const recommendedFieldProps = (key, baseClass) => {
    const incomplete = incompleteFields.includes(key);
    return {
      id: `artwork-${key}`,
      ref: (node) => { fieldRefs.current[key] = node; },
      className: `${baseClass} ${incomplete ? "border-red-400 bg-red-50/70 focus:border-red-500 focus:ring-red-300" : ""}`,
      "aria-invalid": incomplete ? "true" : undefined,
      "aria-describedby": incomplete ? `artwork-${key}-hint` : undefined,
    };
  };

  const IncompleteHint = ({ field }) => incompleteFields.includes(field) ? (
    <p id={`artwork-${field}-hint`} className="mt-1.5 text-xs text-red-600">
      Recommended for a richer portfolio entry. You may leave this blank and submit again.
    </p>
  ) : null;

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isEdit && newFiles.length === 0) {
      toast.error("Please add at least one image");
      fileInputRef.current?.focus();
      return;
    }

    if (form.price !== "" && (!Number.isFinite(Number(form.price)) || Number(form.price) < 0)) {
      toast.error("Price must be a valid non-negative number");
      fieldRefs.current.price?.focus();
      return;
    }

    if (form.year !== "" && (!Number.isInteger(Number(form.year)) || Number(form.year) < 0)) {
      toast.error("Year must be a valid non-negative whole number");
      fieldRefs.current.year?.focus();
      return;
    }

    const isPublishingNow = form.publicationStatus === "published" && (!isEdit || originalPublicationStatusRef.current !== "published");
    if (isPublishingNow) {
      if (form.title.trim().length > 180) {
        toast.error("Title must be 180 characters or fewer");
        fieldRefs.current.title?.focus();
        return;
      }
      if (form.description.length > 12000 && !form.allowLongDescription) {
        toast.error("Description must be 12,000 characters or fewer before publishing");
        fieldRefs.current.description?.focus();
        return;
      }
      const hasImage = existingImages.length > 0 || newFiles.length > 0;
      const maxYear = new Date().getFullYear() + 1;
      if (!form.title.trim() || !hasImage || (form.year !== "" && (Number(form.year) < 1000 || Number(form.year) > maxYear))) {
        toast.error(`Publishing requires a title, image, and a year between 1000 and ${maxYear} when provided`);
        return;
      }
      if (!window.confirm("Publish this artwork to the public website now?")) return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        // 1. Update metadata fields
        await artworkAPI.update(id, {
          title: form.title,
          description: form.description,
          category: form.category,
          price: form.price,
          medium: form.medium,
          dimensions: form.dimensions,
          collection: form.collection,
          series: form.series,
          catalogueNumber: form.catalogueNumber,
          provenance: form.provenance,
          exhibitionHistory: form.exhibitionHistory,
          publications: form.publications,
          creationLocation: form.creationLocation,
          tags: form.tags,
          keywords: form.keywords,
          publicationStatus: form.publicationStatus,
          allowLongDescription: form.allowLongDescription,
          year: form.year,
          isAvailable: form.isAvailable,
          isFeatured: form.isFeatured,
        });

        // 2. Upload any newly staged images
        if (newFiles.length > 0) {
          const imgData = new FormData();
          imgData.append("images", newFiles[0]);
          await artworkAPI.addImages(id, imgData);
        }

        notifyArtworksChanged();
        toast.success("Artwork updated");
        navigate("/admin/artworks");
      } else {
        // Create mode — send everything in one multipart request
        const formData = new FormData();
        Object.entries(form).forEach(([k, v]) => formData.append(k, v));
        formData.append("clientUploadId", clientUploadIdRef.current);
        formData.append("uploadBatchId", uploadBatchIdRef.current);
        formData.append("images", newFiles[0]);

        await artworkAPI.create(formData);
        notifyArtworksChanged();
        toast.success("Artwork created!");
        navigate("/admin/artworks");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save artwork");
    } finally {
      setSaving(false);
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
      <div className="p-6 md:p-8 max-w-4xl">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-8">
          <BackButton fallbackTo="/admin/artworks" className="text-sm px-3 py-1.5">Artworks</BackButton>
          <span className="text-slate/30">/</span>
          <h1 className="font-display text-3xl font-light text-charcoal">
            {isEdit ? "Edit Artwork" : "New Artwork"}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {!isEdit && incompleteWarningShown && incompleteFields.length > 0 && (
            <div role="status" className="border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
              <strong className="font-medium">Some details are incomplete.</strong>{" "}
              Complete the highlighted fields for a richer portfolio entry, or click Add Artwork again to continue.
            </div>
          )}
          {/* ── Basic Information ──────────────────────────────── */}
          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-5">Basic Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Title */}
              <div className="sm:col-span-2">
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Title <span className="normal-case tracking-normal text-slate/40">(recommended)</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  {...recommendedFieldProps("title", "input-field")}
                  placeholder="e.g. Crimson Horizon"
                />
                <IncompleteHint field="title" />
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Category <span className="normal-case tracking-normal text-slate/40">(recommended)</span>
                </label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  {...recommendedFieldProps("category", "input-field")}
                  placeholder="e.g. Landscape, Portrait, Abstract"
                  list="category-suggestions"
                />
                <IncompleteHint field="category" />
                <datalist id="category-suggestions">
                  {["Landscape", "Portrait", "Abstract", "Still Life", "Figurative", "Seascape", "Cityscape", "Wildlife"].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* Price */}
              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Price (₹) <span className="normal-case tracking-normal text-slate/40">(recommended)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                  {...recommendedFieldProps("price", "input-field")}
                  placeholder="e.g. 25000"
                />
                <IncompleteHint field="price" />
              </div>

              {/* Medium */}
              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Medium
                </label>
                <input
                  type="text"
                  value={form.medium}
                  onChange={(e) => set("medium", e.target.value)}
                  {...recommendedFieldProps("medium", "input-field")}
                  placeholder="e.g. Oil on Canvas"
                  list="medium-suggestions"
                />
                <IncompleteHint field="medium" />
                <datalist id="medium-suggestions">
                  {["Oil on Canvas", "Acrylic on Canvas", "Watercolour on Paper", "Mixed Media", "Charcoal on Paper", "Pastel on Board"].map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              {/* Dimensions */}
              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Dimensions
                </label>
                <input
                  type="text"
                  value={form.dimensions}
                  onChange={(e) => set("dimensions", e.target.value)}
                  {...recommendedFieldProps("dimensions", "input-field")}
                  placeholder='e.g. 24" × 36" or 60 × 90 cm'
                />
                <IncompleteHint field="dimensions" />
              </div>

              {/* Year */}
              <div>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Year
                </label>
                <input
                  type="number"
                  min="1900"
                  max={new Date().getFullYear()}
                  value={form.year}
                  onChange={(e) => set("year", e.target.value)}
                  {...recommendedFieldProps("year", "input-field")}
                  placeholder={new Date().getFullYear()}
                />
                <IncompleteHint field="year" />
              </div>

              {/* Description */}
              <div className="sm:col-span-2">
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  {...recommendedFieldProps("description", "textarea-field")}
                  rows={4}
                  placeholder="Describe the artwork, its inspiration, or technique…"
                />
                <IncompleteHint field="description" />
                {form.description.length > 12000 && <label className="mt-3 flex items-center gap-2 text-xs text-slate/70"><input type="checkbox" checked={form.allowLongDescription} onChange={(event) => set("allowLongDescription", event.target.checked)} />I reviewed this unusually long description and want to publish it.</label>}
              </div>
            </div>
          </div>

          {/* ── Status Toggles ─────────────────────────────────── */}
          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-2">Catalogue details</h2>
            <p className="text-xs text-slate/60 mb-5">Optional fields for collectors, exhibitions, and search.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[["collection", "Collection"], ["series", "Series"], ["catalogueNumber", "Catalogue number"], ["creationLocation", "Creation location"]].map(([key, label]) => (
                <label key={key} className="text-xs font-label tracking-widest uppercase text-slate/60">
                  {label}<input className="input-field mt-1" value={form[key]} onChange={(e) => set(key, e.target.value)} />
                </label>
              ))}
              {[["tags", "Tags"], ["keywords", "Search keywords"]].map(([key, label]) => (
                <label key={key} className="sm:col-span-2 text-xs font-label tracking-widest uppercase text-slate/60">
                  {label}
                  <input
                    className="input-field mt-1"
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder="Comma-separated words or phrases"
                    maxLength={1000}
                  />
                </label>
              ))}
              {[["provenance", "Provenance"], ["exhibitionHistory", "Exhibition history"], ["publications", "Publications"]].map(([key, label]) => (
                <label key={key} className="sm:col-span-2 text-xs font-label tracking-widest uppercase text-slate/60">
                  {label}<textarea className="textarea-field mt-1" rows={3} value={form[key]} onChange={(e) => set(key, e.target.value)} />
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-5">Status</h2>
            <div className="flex flex-col sm:flex-row gap-6">
              <label className="text-xs font-label tracking-widest uppercase text-slate/60">
                Publication
                <select className="input-field mt-1 min-w-44" value={form.publicationStatus} onChange={(e) => set("publicationStatus", e.target.value)}>
                  <option value="published">Published</option><option value="draft">Draft</option>
                  <option value="unpublished">Unpublished</option><option value="archived">Archived</option>
                </select>
              </label>
              {/* Available toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => set("isAvailable", !form.isAvailable)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                    form.isAvailable ? "bg-green-500" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                      form.isAvailable ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-charcoal">Available for Enquiry</p>
                  <p className="text-xs text-slate/50">
                    {form.isAvailable ? "Shown as 'Available for Enquiry'" : "Shown as 'Not Available for Enquiry'"}
                  </p>
                </div>
              </label>

              {/* Featured toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => set("isFeatured", !form.isFeatured)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                    form.isFeatured ? "bg-gold" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                      form.isFeatured ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-charcoal">Featured on Homepage</p>
                  <p className="text-xs text-slate/50">
                    {form.isFeatured ? "Visible in featured section" : "Not featured"}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* ── Images ─────────────────────────────────────────── */}
          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-5">
              Images
              {!isEdit && <span className="text-red-400 text-sm ml-2">*</span>}
            </h2>

            {/* Already-saved images (edit mode only) */}
            {isEdit && existingImages.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-3">
                  Current Images
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {existingImages.map((img) => (
                    <div key={img.publicId} className="relative group">
                      <img
                        src={img.url}
                        alt=""
                        className="w-full aspect-square object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteExisting(img.publicId)}
                        disabled={deletingImg === img.publicId}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white text-xs 
                                   opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        title="Remove image"
                      >
                        {deletingImg === img.publicId ? "…" : "×"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Newly staged images */}
            {previews.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-3">
                  {isEdit ? "Images to Add" : "Selected Images"}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={src}
                        alt=""
                        className="w-full aspect-square object-cover opacity-80"
                      />
                      <button
                        type="button"
                        onClick={() => removeNewFile(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white text-xs 
                                   opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        title="Remove"
                      >
                        ×
                      </button>
                      {/* "New" badge */}
                      <span className="absolute bottom-1 left-1 text-[9px] bg-gold text-white px-1 font-label uppercase">
                        New
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 hover:border-gold p-8 text-center cursor-pointer transition-colors duration-200"
            >
              <p className="text-3xl mb-2">📁</p>
              <p className="text-sm text-slate/60 mb-1">
                Click to select one image
              </p>
              <p className="text-xs text-slate/40">JPG, JPEG, PNG, WebP, or AVIF.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={handleFiles}
              />
            </div>

            {!isEdit && newFiles.length === 0 && (
              <p className="text-xs text-red-400 mt-2">At least one image is required</p>
            )}
          </div>

          {/* ── Actions ────────────────────────────────────────── */}
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setPreviewOpen(true)} className="btn-secondary">Preview</button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saving
                ? <><LoadingSpinner size="sm" light />{isEdit ? "Saving…" : "Creating…"}</>
                : isEdit ? "Save Changes" : "Add Artwork"
              }
            </button>
            <BackButton fallbackTo="/admin/artworks" variant="light" className="btn-secondary" />
          </div>
        </form>
        {previewOpen && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="artwork-preview-title" onKeyDown={(event) => { if (event.key === "Escape") setPreviewOpen(false); }}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto bg-white p-6" tabIndex={-1}>
            <div className="mb-5 flex items-start justify-between gap-4"><div><p className="eyebrow">Admin preview · {form.publicationStatus}</p><h2 id="artwork-preview-title" className="font-display text-3xl">{form.title || "Untitled"}</h2></div><button type="button" className="min-h-11 min-w-11 text-2xl" aria-label="Close preview" onClick={() => setPreviewOpen(false)}>×</button></div>
            {(previews[0] || existingImages[0]?.url) && <img src={previews[0] || existingImages[0]?.url} alt={form.title || "Artwork preview"} className="mb-6 max-h-[55vh] w-full object-contain bg-gray-50" />}
            <p className="mb-3 text-sm text-slate/60">{[form.medium, form.dimensions, form.year, form.collection].filter(Boolean).join(" · ")}</p>
            {form.description && <p className="whitespace-pre-line leading-relaxed text-slate">{form.description}</p>}
          </div>
        </div>}
      </div>
    </AdminLayout>
  );
};

export default ArtworkFormPage;
