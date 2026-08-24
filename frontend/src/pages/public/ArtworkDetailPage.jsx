// pages/public/ArtworkDetailPage.jsx
// Single artwork detail page with gallery and inquiry form.

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import BackButton from "../../components/shared/BackButton";
import { publicDataAPI } from "../../services/publicData";
import { inquiryAPI } from "../../services/api";
import { submitNetlifyForm } from "../../services/netlifyForms";
import { validateInquiryForm } from "../../services/inquiryValidation";
import { PageLoader } from "../../components/shared/LoadingSpinner";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import ArtworkPreviewModal from "../../components/public/ArtworkPreviewModal";
import ArtworkMasonry from "../../components/public/ArtworkMasonry";
import { cloudinaryThumbnailUrl, galleryThumbnailWidths } from "../../utils/imageDelivery";

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
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [related, setRelated] = useState([]);
  const [neighbors, setNeighbors] = useState({ previous: null, next: null });
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
    if (!artwork?._id) return undefined;
    let active = true;
    publicDataAPI.getArtworks({ category: artwork.category, limit: 6 }, {
      onLiveData: (result) => active && setRelated((result.items || []).filter((item) => item._id !== artwork._id).slice(0, 4)),
    }).then((result) => {
      if (active) setRelated((result.items || []).filter((item) => item._id !== artwork._id).slice(0, 4));
    }).catch(() => {});
    return () => { active = false; };
  }, [artwork?._id, artwork?.category]);

  useEffect(() => {
    if (!artwork?._id) return undefined;
    let active = true;
    publicDataAPI.getArtworkNeighbors(artwork._id)
      .then((items) => { if (active) setNeighbors(items); })
      .catch(() => { if (active) setNeighbors({ previous: null, next: null }); });
    return () => { active = false; };
  }, [artwork?._id]);

  useEffect(() => {
    if (!artwork) return;
    const siteTitle = "Artist Portfolio";
    document.title = `${artwork.title || "Artwork"} | ${siteTitle}`;
    const description = (artwork.description || [artwork.medium, artwork.year].filter(Boolean).join(" · ")).slice(0, 300);
    const setMeta = (selector, attribute, value) => {
      let tag = document.querySelector(selector);
      if (!tag) { tag = document.createElement("meta"); document.head.appendChild(tag); }
      tag.setAttribute(attribute, selector.includes("property=") ? selector.match(/property="([^"]+)/)?.[1] : selector.match(/name="([^"]+)/)?.[1]);
      tag.content = value;
    };
    if (description) setMeta('meta[name="description"]', "name", description);
    setMeta('meta[property="og:title"]', "property", artwork.title || "Artwork");
    if (artwork.images?.[0]?.url) setMeta('meta[property="og:image"]', "property", artwork.images[0].url);
  }, [artwork]);

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
      const payload = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        message: data.message,
        inquiryType: "artwork",
        sourcePage: window.location.href,
        artwork: artwork._id,
        artworkTitle: artwork.title?.trim() || "Artwork",
        artworkUrl: window.location.href,
      };

      await inquiryAPI.create(payload);
      submitNetlifyForm("artwork-inquiry", {
        ...payload,
        artworkId: artwork._id,
        artworkImage: artwork.images?.[0]?.url,
      }).catch((error) => {
        console.warn("Netlify backup artwork inquiry failed after backend save.", error);
      });

      toast.success("Thank you. Your inquiry has been sent successfully.");
      setSent(true);
      setErrors({});
      setForm(emptyInquiryForm);
    } catch (error) {
      const message = error.response?.data?.message ||
        (error.request
          ? "We could not reach the enquiry service. Please try again."
          : "We could not send your inquiry. Please try again.");
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
            <Link to="/gallery" state={{ restoreFromArtwork: true }} className="hover:text-gold transition-colors">Gallery</Link>
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
                    src={cloudinaryThumbnailUrl(artwork.images[activeImage].url, 1440)}
                    srcSet={galleryThumbnailWidths(artwork.images[activeImage].width).map((width) => `${cloudinaryThumbnailUrl(artwork.images[activeImage].url, width)} ${width}w`).join(", ")}
                    sizes="(max-width: 1023px) 100vw, 58vw"
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
                <div className="flex gap-1 overflow-x-auto pb-2">
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
              <h1 className="mb-4 font-display text-3xl font-light leading-tight text-charcoal md:text-5xl">
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
                {artwork.collection && <div><p className="mb-1 text-xs font-label uppercase tracking-widest text-slate/50">Collection</p><p className="text-sm text-charcoal">{artwork.collection}</p></div>}
                {artwork.catalogueNumber && <div><p className="mb-1 text-xs font-label uppercase tracking-widest text-slate/50">Catalogue</p><p className="text-sm text-charcoal">{artwork.catalogueNumber}</p></div>}
              </div>}

              {artwork.description && (
                <div className="mb-8">
                  <p className="whitespace-pre-line text-slate leading-relaxed font-light">
                    {!descriptionExpanded && artwork.description.length > 1200 ? `${artwork.description.slice(0, 1200).trim()}…` : artwork.description}
                  </p>
                  {artwork.description.length > 1200 && <button type="button" className="mt-4 min-h-11 font-label text-xs uppercase tracking-wider text-charcoal underline decoration-gold underline-offset-4" onClick={() => setDescriptionExpanded((value) => !value)} aria-expanded={descriptionExpanded}>{descriptionExpanded ? "Show less" : "Read more"}</button>}
                </div>
              )}

              {[['Provenance', artwork.provenance], ['Exhibition history', artwork.exhibitionHistory], ['Publications', artwork.publications]].filter(([, value]) => value).map(([label, value]) => <section key={label} className="mb-6 border-t border-gray-100 pt-5"><h2 className="mb-2 text-xs font-label uppercase tracking-widest text-slate/50">{label}</h2><p className="whitespace-pre-line text-sm leading-relaxed text-slate/80">{value}</p></section>)}

              {showInquiry && (
                <form
                  name="artwork-inquiry"
                  method="POST"
                  data-netlify="true"
                  netlify-honeypot="bot-field"
                  noValidate
                  onSubmit={handleSubmit}
                  className="mt-8 animate-slide-up border border-gray-100 p-4 sm:p-6"
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
                        autoComplete="name"
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
                        autoComplete="email"
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
                        autoComplete="tel"
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
                      className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
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
      {related.length > 0 && <section className="border-t border-charcoal/10 bg-ivory py-12"><div className="container-site"><p className="eyebrow mb-2">Continue exploring</p><h2 className="mb-8 font-display text-3xl font-light">Related artworks</h2><ArtworkMasonry artworks={related} priorityCount={0} /></div></section>}
      {(neighbors.previous || neighbors.next) && <nav className="border-t border-charcoal/10 bg-white py-8" aria-label="Adjacent artworks"><div className="container-site grid grid-cols-2 gap-4">
        <div>{neighbors.previous && <Link to={`/artwork/${neighbors.previous._id}`} className="block min-h-11 text-sm text-charcoal hover:text-gold"><span className="block text-xs font-label uppercase tracking-widest text-slate/50">Previous</span>{neighbors.previous.title}</Link>}</div>
        <div className="text-right">{neighbors.next && <Link to={`/artwork/${neighbors.next._id}`} className="block min-h-11 text-sm text-charcoal hover:text-gold"><span className="block text-xs font-label uppercase tracking-widest text-slate/50">Next</span>{neighbors.next.title}</Link>}</div>
      </div></nav>}
    </PublicLayout>
  );
};

export default ArtworkDetailPage;
