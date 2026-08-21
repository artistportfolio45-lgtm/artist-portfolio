// models/Settings.js
// Global website settings - one document, updated by admin

const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    websiteTitle: { type: String, default: "Artist Portfolio" },
    websiteDescription: {
      type: String,
      default: "A curated portfolio of original artworks.",
    },
    logoUrl: { type: String, default: "" },
    logoPublicId: { type: String, default: "" },
    footerText: { type: String, default: "(c) 2026 Artist Portfolio. All rights reserved." },
    heroEyebrow: { type: String, default: "Original Fine Art" },
    heroHeading: { type: String, default: "Art That" },
    heroHeadingAccent: { type: String, default: "Speaks" },
    heroSubtitle: {
      type: String,
      default: "Explore a collection of original paintings — each a singular expression of light, form, and feeling.",
    },
    heroPrimaryButtonText: { type: String, default: "Explore Gallery" },
    heroSecondaryButtonText: { type: String, default: "Get in Touch" },
    heroBackgroundSource: {
      type: String,
      enum: ["none", "upload", "artwork"],
      default: "none",
    },
    heroBackgroundUrl: { type: String, trim: true, default: "" },
    heroBackgroundPublicId: { type: String, trim: true, default: "" },
    heroBackgroundWidth: { type: Number, default: null },
    heroBackgroundHeight: { type: Number, default: null },
    heroBackgroundArtworkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artwork",
      default: null,
    },
    heroBackgroundAltText: { type: String, trim: true, maxlength: 240, default: "" },
    heroBackgroundPosition: {
      type: String,
      enum: ["center", "top", "bottom", "left", "right"],
      default: "center",
    },
    heroOverlayOpacity: { type: Number, min: 0.2, max: 0.9, default: 0.55 },
    primaryColor: { type: String, default: "#1C1C1E" },
    secondaryColor: { type: String, default: "#F8F5F0" },
    accentColor: { type: String, default: "#C9A84C" },
    themePreset: { type: String, default: "gallery-light" },
    themeMode: { type: String, default: "light" },
    backgroundColor: { type: String, default: "#F8F5F0" },
    surfaceColor: { type: String, default: "#FFFFFF" },
    textColor: { type: String, default: "#1C1C1E" },
    mutedTextColor: { type: String, default: "#4A4A5A" },
    borderColor: { type: String, default: "#E8E8E8" },
    buttonRadius: { type: String, default: "0px" },
    cardRadius: { type: String, default: "0px" },
    maintenanceMode: { type: Boolean, default: false },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    seoKeywords: { type: String, default: "" },
    // Contact info (separate from profile for flexibility)
    contactEmail: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    contactAddress: { type: String, default: "" },
    // Social links
    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    youtube: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
    expectedResponseTime: { type: String, default: "" },
    privacyReassurance: { type: String, default: "" },
    studioVisitInformation: { type: String, default: "" },
    additionalSocialLinks: {
      type: [{ label: { type: String, trim: true }, url: { type: String, trim: true } }],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
