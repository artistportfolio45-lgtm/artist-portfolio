// pages/public/ArtworkDetailPage.jsx
// Single artwork detail page with gallery and inquiry form.

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import BackButton from "../../components/shared/BackButton";
import { publicDataAPI } from "../../services/publicData";
import { submitNetlifyForm } from "../../services/netlifyForms";
import { validateInquiryForm } from "../../services/inquiryValidation";
import { PageLoader } from "../../components/shared/LoadingSpinner";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import ArtworkPreviewModal from "../../components/public/ArtworkPreviewModal";

const emptyInquiryForm = {
  name: "",
  email: "",
  phone: "",
  message: "",
  botField: "",
};

const ArtworkDetailPage = () => {
  const { id } = useParams();
  const [artwork, setArtwork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [showInquiry, setShowInquiry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState(emptyInquiryForm);
  const [previewOpen, setPreviewOpen] = useState(false);
  const artworkImageRef = useRef(null);
  const artworkInfoRef = useRef(null);

  useEffect(() => {
    publicDataAPI.getArtworkById(id, { onLiveData: setArtwork })
      .then((item) => {
        if (!item) throw new Error("Artwork not found");
        setArtwork(item);
      })
      .catch(() => toast.error("Artwork not found"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    artworkInfoRef.current?.scrollTo({ top: 0 });
  }, [artwork?._id]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
    setSent(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || !artwork) return;

    const { data, errors: validationErrors, isValid } = validateInquiryForm(form);
    if (!isValid) {
      setErrors(validationErrors);
      toast.error(validationErrors.form || "Please check the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      await submitNetlifyForm("artwork-inquiry", {
        name: data.name,
        email: data.email,
        phone: data.phone,
        message: data.message,
        inquiryType: "artwork",
        sourcePage: window.location.href,
        artworkId: artwork._id,
        artworkTitle: artwork.title?.trim() || "Artwork",
        artworkUrl: window.location.href,
        artworkImage: artwork.images?.[0]?.url,
      });

      toast.success("Thank you. Your inquiry has been sent successfully.");
      setSent(true);
      setErrors({});
      setForm(emptyInquiryForm);
    } catch {
      const message = "We could not send your inquiry. Please try again.";
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PublicLayout>
        <PageLoader />
      </PublicLayout>
    );
  }

  if (!artwork) {
    return (
      <PublicLayout>
        <div className="pt-20 lg:pt-0 bg-white min-h-screen">
          <div className="container-site py-12">
            <BackButton fallbackTo="/gallery" ariaLabel="Back to Gallery" className="mb-6">
              Back to Gallery
            </BackButton>

            <div className="min-h-[50vh] flex items-center justify-center">
              <div className="text-center">
                <p className="font-display text-3xl mb-4">Artwork not found</p>
              </div>
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const displayTitle = artwork.title?.trim() || "Artwork";
  const numericPrice = Number(artwork.price);
  const formattedPrice = artwork.price === null || artwork.price === undefined || !Number.isFinite(numericPrice)
    ? null
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(numericPrice);
  const hasFacts = Boolean(artwork.medium?.trim() || artwork.dimensions?.trim() || artwork.year);

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const primaryImage = artwork.images?.[0]?.url || "";

  return (
    <PublicLayout>
      <div className="artwork-detail-page bg-white">
        <div className="container-site artwork-detail-shell">
          <BackButton fallbackTo="/gallery" ariaLabel="Back to Gallery" className="mb-6">
            Back to Gallery
          </BackButton>

          <nav className="mb-8 text-sm text-slate/60 font-label">
            <Link to="/gallery" className="hover:text-gold transition-colors">Gallery</Link>
            <span className="mx-2">/</span>
            <span className="text-charcoal">{displayTitle}</span>
          </nav>

          <div className="artwork-detail-layout">
            <div className="artwork-image-panel">
              <button
                ref={artworkImageRef}
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="artwork-image-stage group flex w-full cursor-zoom-in items-center justify-center overflow-hidden bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
                aria-label={`Open full-screen preview of ${displayTitle}`}
              >
                {artwork.images?.[activeImage]?.url ? (
                  <img
                    src={artwork.images[activeImage].url}
                    alt={`${displayTitle} image ${activeImage + 1}`}
                    width={artwork.images[activeImage].width || undefined}
                    height={artwork.images[activeImage].height || undefined}
                    className="artwork-detail-image transition-transform duration-500 group-hover:scale-[1.01]"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-gray-200 text-8xl">&#128444;</span>
                  </div>
                )}
              </button>

              {artwork.images?.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {artwork.images.map((img, index) => (
                    <button
                      key={img.publicId || img.url || index}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      className={`flex-shrink-0 w-16 h-16 overflow-hidden border-2 transition-all ${
                        index === activeImage ? "border-gold" : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                      aria-label={`View artwork image ${index + 1}`}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              ref={artworkInfoRef}
              className="artwork-info-panel flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
              tabIndex={0}
              role="region"
              aria-label={`${displayTitle} details`}
            >
              <div className="artwork-info-content">
              {artwork.category && artwork.category !== "Uncategorized" && (
                <p className="eyebrow mb-3">{artwork.category}</p>
              )}
              <h1 className="font-display text-4xl md:text-5xl font-light text-charcoal mb-4 leading-tight">
                {displayTitle}
              </h1>

              <span className={`self-start text-xs font-label tracking-widest uppercase px-3 py-1 mb-6 ${
                artwork.isAvailable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              }`}>
                {artwork.isAvailable ? "Available for Enquiry" : "Not Available for Enquiry"}
              </span>

              {formattedPrice && (
                <p className="font-display text-3xl text-charcoal mb-8">{formattedPrice}</p>
              )}

              {hasFacts && <div className="grid grid-cols-2 gap-4 mb-8 border-t border-b border-gray-100 py-6">
                {artwork.medium && (
                  <div>
                    <p className="text-xs font-label text-slate/50 tracking-widest uppercase mb-1">Medium</p>
                    <p className="text-sm text-charcoal">{artwork.medium}</p>
                  </div>
                )}
                {artwork.dimensions && (
                  <div>
                    <p className="text-xs font-label text-slate/50 tracking-widest uppercase mb-1">Dimensions</p>
                    <p className="text-sm text-charcoal">{artwork.dimensions}</p>
                  </div>
                )}
                {artwork.year && (
                  <div>
                    <p className="text-xs font-label text-slate/50 tracking-widest uppercase mb-1">Year</p>
                    <p className="text-sm text-charcoal">{artwork.year}</p>
                  </div>
                )}
              </div>}

              {artwork.description && (
                <p className="text-slate leading-relaxed mb-8 font-light">{artwork.description}</p>
              )}

              {showInquiry && (
                <form
                  name="artwork-inquiry"
                  method="POST"
                  data-netlify="true"
                  netlify-honeypot="bot-field"
                  noValidate
                  onSubmit={handleSubmit}
                  className="mt-8 border border-gray-100 p-6 animate-slide-up"
                >
                  <input type="hidden" name="form-name" value="artwork-inquiry" />
                  <input type="hidden" name="inquiryType" value="artwork" />
                  <input type="hidden" name="sourcePage" value={currentUrl} />
                  <input type="hidden" name="artworkId" value={artwork._id} />
                  <input type="hidden" name="artworkTitle" value={displayTitle} />
                  <input type="hidden" name="artworkUrl" value={currentUrl} />
                  <input type="hidden" name="artworkImage" value={primaryImage} />
                  <div className="hidden" aria-hidden="true">
                    <label>
                      Do not fill this out
                      <input
                        name="bot-field"
                        tabIndex={-1}
                        autoComplete="off"
                        value={form.botField}
                        onChange={(event) => updateField("botField", event.target.value)}
                      />
                    </label>
                  </div>

                  <h3 className="font-display text-xl mb-2">Send an Enquiry</h3>
                  <p className="text-sm text-slate/70 mb-4">Inquiry about: {displayTitle}</p>
                  {sent && (
                    <p className="mb-4 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                      Thank you. Your inquiry has been sent successfully.
                    </p>
                  )}
                  {errors.form && (
                    <p className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {errors.form}
                    </p>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="artwork-inquiry-name" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                        Name *
                      </label>
                      <input
                        id="artwork-inquiry-name"
                        name="name"
                        type="text"
                        value={form.name}
                        onChange={(event) => updateField("name", event.target.value)}
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? "artwork-inquiry-name-error" : undefined}
                        className="input-field"
                        required
                        maxLength={100}
                      />
                      {errors.name && <p id="artwork-inquiry-name-error" className="mt-1 text-xs text-red-600">{errors.name}</p>}
                    </div>

                    <div>
                      <label htmlFor="artwork-inquiry-email" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                        Email *
                      </label>
                      <input
                        id="artwork-inquiry-email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={(event) => updateField("email", event.target.value)}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "artwork-inquiry-email-error" : undefined}
                        className="input-field"
                        required
                        maxLength={254}
                      />
                      {errors.email && <p id="artwork-inquiry-email-error" className="mt-1 text-xs text-red-600">{errors.email}</p>}
                    </div>

                    <div>
                      <label htmlFor="artwork-inquiry-phone" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                        Phone
                      </label>
                      <input
                        id="artwork-inquiry-phone"
                        name="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(event) => updateField("phone", event.target.value)}
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? "artwork-inquiry-phone-error" : undefined}
                        className="input-field"
                        maxLength={30}
                      />
                      {errors.phone && <p id="artwork-inquiry-phone-error" className="mt-1 text-xs text-red-600">{errors.phone}</p>}
                    </div>

                    <div>
                      <label htmlFor="artwork-inquiry-message" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                        Message *
                      </label>
                      <textarea
                        id="artwork-inquiry-message"
                        name="message"
                        value={form.message}
                        onChange={(event) => updateField("message", event.target.value)}
                        aria-invalid={Boolean(errors.message)}
                        aria-describedby={errors.message ? "artwork-inquiry-message-error" : undefined}
                        className="textarea-field"
                        rows={4}
                        required
                        maxLength={3000}
                        placeholder="Your message"
                      />
                      {errors.message && <p id="artwork-inquiry-message-error" className="mt-1 text-xs text-red-600">{errors.message}</p>}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      aria-busy={submitting}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? <><LoadingSpinner size="sm" light />Sending...</> : "Send Enquiry"}
                    </button>
                  </div>
                </form>
              )}
              </div>

              {artwork.isAvailable && (
                <div className="artwork-info-footer">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInquiry(!showInquiry);
                      setErrors({});
                    }}
                    className="btn-gold"
                    aria-expanded={showInquiry}
                  >
                    {showInquiry ? "Close Inquiry Form" : "Send an Enquiry"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {previewOpen && (
        <ArtworkPreviewModal
          artwork={artwork}
          initialIndex={activeImage}
          onIndexChange={setActiveImage}
          onClose={() => {
            setPreviewOpen(false);
            requestAnimationFrame(() => artworkImageRef.current?.focus());
          }}
        />
      )}
    </PublicLayout>
  );
};

export default ArtworkDetailPage;
