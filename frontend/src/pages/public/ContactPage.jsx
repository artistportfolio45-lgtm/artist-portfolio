// pages/public/ContactPage.jsx
// Contact form + artist contact info + social links

import { useEffect, useState } from "react";
import PublicLayout from "../../components/public/PublicLayout";
import { publicDataAPI } from "../../services/publicData";
import { inquiryAPI } from "../../services/api";
import { submitNetlifyForm } from "../../services/netlifyForms";
import { validateInquiryForm } from "../../services/inquiryValidation";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import ArtworkCombobox from "../../components/public/ArtworkCombobox";
import PublicSocialLinks from "../../components/public/PublicSocialLinks";
import { useSettings } from "../../hooks/useSettings";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
  artworkId: "",
  botField: "",
};

const ContactPage = () => {
  const { settings } = useSettings();
  const [profile, setProfile] = useState(null);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const contact = {
    ...(profile || {}),
    email: settings?.contactEmail || profile?.email,
    phone: settings?.contactPhone || profile?.phone,
    whatsapp: settings?.whatsapp || profile?.whatsapp,
    address: settings?.contactAddress || profile?.address,
  };

  useEffect(() => {
    publicDataAPI.getProfile({ onLiveData: setProfile })
      .then(setProfile)
      .catch(console.error);
    const artworkId = new URLSearchParams(window.location.search).get("artwork");
    if (artworkId) {
      publicDataAPI.getArtworkById(artworkId, { onLiveData: setSelectedArtwork })
        .then((artwork) => {
          if (!artwork) return;
          setSelectedArtwork(artwork);
          setForm((current) => ({
            ...current,
            artworkId: artwork._id,
            subject: current.subject || `Enquiry about ${artwork.title}${artwork.catalogueNumber ? ` (${artwork.catalogueNumber})` : ""}`,
          }));
        })
        .catch(console.error);
    }
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
    setSent(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

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
        phone: data.phone || undefined,
        subject: data.subject || "General Enquiry",
        message: data.message,
        inquiryType: selectedArtwork ? "artwork" : "contact",
        sourcePage: window.location.href,
      };

      if (selectedArtwork) {
        payload.artwork = selectedArtwork._id;
        payload.artworkTitle = selectedArtwork.title;
        payload.artworkUrl = `${window.location.origin}/artwork/${selectedArtwork._id}`;
      }

      await inquiryAPI.create(payload);

      submitNetlifyForm("contact", {
        ...payload,
        artworkId: selectedArtwork?._id,
        artworkTitle: selectedArtwork?.title || "General Enquiry",
      }).catch((error) => {
        console.warn("Netlify backup enquiry submission failed after backend save.", error);
      });

      toast.success("Thank you. Your message has been sent successfully.");
      setSent(true);
      setErrors({});
      setForm(emptyForm);
      setSelectedArtwork(null);
    } catch (error) {
      console.error("Backend enquiry submission failed:", error);
      const message =
        error.response?.data?.message ||
        (error.request
          ? "We could not reach the enquiry service. Please try again."
          : "We could not send your message. Please try again.");
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <div className="bg-charcoal pt-28 pb-16 lg:pt-16 lg:pb-12">
        <div className="container-site text-center">
          <p className="eyebrow text-gold mb-3">Get in Touch</p>
          <h1 className="font-display text-5xl md:text-6xl font-light text-white">
            Contact
          </h1>
        </div>
      </div>

      <section className="section bg-ivory">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            <div>
              <p className="eyebrow mb-6">Reach Out</p>
              <h2 className="font-display text-3xl md:text-4xl font-light text-charcoal mb-6">
                Let's discuss your interest in a piece
              </h2>
              <p className="text-slate font-light leading-relaxed mb-10">
                Whether you're interested in an existing artwork, a commission, or simply want
                to know more about the creative process, I'd love to hear from you.
              </p>

              <div className="space-y-5">
                {contact.email && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 border border-gold/30 flex items-center justify-center text-gold flex-shrink-0">
                      &#9993;
                    </div>
                    <div>
                      <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-0.5">Email</p>
                      <a href={`mailto:${contact.email}`} className="text-charcoal hover:text-gold transition-colors">
                        {contact.email}
                      </a>
                    </div>
                  </div>
                )}

                {contact.phone && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 border border-gold/30 flex items-center justify-center text-gold flex-shrink-0">
                      &#9742;
                    </div>
                    <div>
                      <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-0.5">Phone</p>
                      <a href={`tel:${contact.phone}`} className="text-charcoal hover:text-gold transition-colors">
                        {contact.phone}
                      </a>
                    </div>
                  </div>
                )}

                {contact.whatsapp && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 border border-gold/30 flex items-center justify-center text-gold flex-shrink-0">
                      &#128172;
                    </div>
                    <div>
                      <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-0.5">WhatsApp</p>
                      <a
                        href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-charcoal hover:text-gold transition-colors"
                      >
                        Message on WhatsApp
                      </a>
                    </div>
                  </div>
                )}

                {contact.address && (
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 border border-gold/30 flex items-center justify-center text-gold flex-shrink-0 mt-0.5">
                      &#8982;
                    </div>
                    <div>
                      <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-0.5">Location</p>
                      <p className="text-charcoal">{contact.address}</p>
                    </div>
                  </div>
                )}
              </div>

              {(settings?.expectedResponseTime || settings?.studioVisitInformation || settings?.privacyReassurance) && <div className="mt-8 space-y-2 border-l-2 border-gold/40 pl-4 text-sm leading-relaxed text-slate/70">
                {settings.expectedResponseTime && <p>{settings.expectedResponseTime}</p>}
                {settings.studioVisitInformation && <p>{settings.studioVisitInformation}</p>}
                {settings.privacyReassurance && <p>{settings.privacyReassurance}</p>}
              </div>}
              <div className="mt-8"><PublicSocialLinks /></div>

            </div>

            <div>
              <form
                name="contact"
                method="POST"
                data-netlify="true"
                netlify-honeypot="bot-field"
                noValidate
                onSubmit={handleSubmit}
                className="bg-white p-8 shadow-sm"
              >
                <input type="hidden" name="form-name" value="contact" />
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

                <h3 className="font-display text-2xl font-light mb-6">Send a Message</h3>
                {sent && (
                  <p className="mb-4 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    Thank you. Your message has been sent successfully.
                  </p>
                )}
                {errors.form && (
                  <p className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errors.form}
                  </p>
                )}

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="contact-name" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                        Name *
                      </label>
                      <input
                        id="contact-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        value={form.name}
                        onChange={(event) => updateField("name", event.target.value)}
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? "contact-name-error" : undefined}
                        className="input-field"
                        required
                        maxLength={100}
                      />
                      {errors.name && <p id="contact-name-error" className="mt-1 text-xs text-red-600">{errors.name}</p>}
                    </div>
                    <div>
                      <label htmlFor="contact-email" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                        Email *
                      </label>
                      <input
                        id="contact-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={(event) => updateField("email", event.target.value)}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "contact-email-error" : undefined}
                        className="input-field"
                        required
                        maxLength={254}
                      />
                      {errors.email && <p id="contact-email-error" className="mt-1 text-xs text-red-600">{errors.email}</p>}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-phone" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                      Phone
                    </label>
                    <input
                      id="contact-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                      aria-invalid={Boolean(errors.phone)}
                      aria-describedby={errors.phone ? "contact-phone-error" : undefined}
                      className="input-field"
                      maxLength={30}
                    />
                    {errors.phone && <p id="contact-phone-error" className="mt-1 text-xs text-red-600">{errors.phone}</p>}
                  </div>

                  <div>
                    <label htmlFor="contact-subject" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                      Subject
                    </label>
                    <input
                      id="contact-subject"
                      name="subject"
                      type="text"
                      value={form.subject}
                      onChange={(event) => updateField("subject", event.target.value)}
                      aria-invalid={Boolean(errors.subject)}
                      aria-describedby={errors.subject ? "contact-subject-error" : undefined}
                      className="input-field"
                      maxLength={150}
                    />
                    {errors.subject && <p id="contact-subject-error" className="mt-1 text-xs text-red-600">{errors.subject}</p>}
                  </div>

                  <div>
                    <label htmlFor="contact-artwork" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                      Interested in Artwork
                    </label>
                    <ArtworkCombobox
                      selected={selectedArtwork}
                      onSelect={(artwork) => {
                        setSelectedArtwork(artwork);
                        updateField("artworkId", artwork?._id || "");
                        if (artwork && !form.subject.trim()) {
                          updateField("subject", `Enquiry about ${artwork.title}${artwork.catalogueNumber ? ` (${artwork.catalogueNumber})` : ""}`);
                        }
                      }}
                    />
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                      Message *
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      value={form.message}
                      onChange={(event) => updateField("message", event.target.value)}
                      aria-invalid={Boolean(errors.message)}
                      aria-describedby={errors.message ? "contact-message-error" : undefined}
                      className="textarea-field"
                      rows={5}
                      required
                      maxLength={3000}
                      placeholder="Tell me about your interest..."
                    />
                    {errors.message && <p id="contact-message-error" className="mt-1 text-xs text-red-600">{errors.message}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    aria-busy={submitting}
                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? <><LoadingSpinner size="sm" light />Sending...</> : "Send Message"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default ContactPage;
