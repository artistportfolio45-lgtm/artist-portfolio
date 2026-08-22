// routes/settings.js
// Website settings — public read, admin update

const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Settings = require("../models/Settings");
const Artwork = require("../models/Artwork");
const { protect } = require("../middleware/auth");
const {
  uploadLogo,
  uploadHomeHero,
  cloudinary,
  getCloudinaryFileInfo,
} = require("../config/cloudinary");
const { syncPublicData } = require("../utils/publicDataSync");
const {
  HomeHeroValidationError,
  getArtworkHeroImage,
  getOwnedHeroUpload,
  isOwnedHeroUpload,
  normalizeHomeHeroPayload,
  serializeSettingsWithHero,
} = require("../utils/homeHero");
const adminOnly = (req, res, next) => req.user?.role === "admin"
  ? next()
  : res.status(403).json({ success: false, message: "Admin access required" });

const normalizePhone = (value = "") => {
  const raw = String(value).trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) throw new Error("Enter a valid phone number with country code");
  return `+${digits}`;
};
const normalizeUrl = (value = "") => {
  const raw = String(value).trim();
  if (!raw) return "";
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Social links must use http or https");
  return url.toString();
};

// Helper: get or create the single settings document
const getOrCreateSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
};

const findPublicHeroArtwork = async (artworkId) => {
  if (!mongoose.isValidObjectId(artworkId)) return null;
  return Artwork.findOne({
    _id: artworkId,
    publicationStatus: { $nin: ["draft", "unpublished", "archived"] },
    "images.0.url": { $exists: true, $ne: "" },
  }).select("_id title images publicationStatus updatedAt");
};

const settingsResponse = async (settings) => {
  const artwork = settings.heroBackgroundSource === "artwork"
    ? await findPublicHeroArtwork(settings.heroBackgroundArtworkId)
    : null;
  return serializeSettingsWithHero(settings, artwork);
};

const applyHomeHeroContent = (settings, values) => {
  for (const field of [
    "heroEyebrow",
    "heroHeading",
    "heroHeadingAccent",
    "heroSubtitle",
    "heroPrimaryButtonText",
    "heroSecondaryButtonText",
  ]) {
    if (values[field] !== undefined) settings[field] = values[field];
  }
  settings.heroBackgroundAltText = values.heroBackgroundAltText;
  settings.heroBackgroundPosition = values.heroBackgroundPosition;
  settings.heroOverlayOpacity = values.heroOverlayOpacity;
};

const clearUploadedHeroFields = (settings) => {
  settings.heroBackgroundUrl = "";
  settings.heroBackgroundPublicId = "";
  settings.heroBackgroundWidth = null;
  settings.heroBackgroundHeight = null;
};

const destroyOwnedHeroUpload = async (upload) => {
  if (!upload?.publicId || !isOwnedHeroUpload(upload.publicId)) return false;
  try {
    await cloudinary.uploader.destroy(upload.publicId);
    return true;
  } catch (error) {
    console.error("Hero background cleanup error:", error);
    return false;
  }
};

// @route   GET /api/settings
// @desc    Get website settings (public)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, settings: await settingsResponse(settings) });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   GET /api/settings/home
// @desc    Get Home page settings for the admin editor
// @access  Private
router.get("/home", protect, adminOnly, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, settings: await settingsResponse(settings) });
  } catch (error) {
    console.error("Get Home page settings error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   PUT /api/settings/home
// @desc    Save Home Hero content and select/remove an existing background
// @access  Private
router.put("/home", protect, adminOnly, async (req, res) => {
  try {
    const values = normalizeHomeHeroPayload(req.body);
    const settings = await getOrCreateSettings();
    const previousUpload = getOwnedHeroUpload(settings);

    applyHomeHeroContent(settings, values);

    if (values.heroBackgroundSource === "artwork") {
      const artwork = await findPublicHeroArtwork(values.heroBackgroundArtworkId);
      if (!getArtworkHeroImage(artwork)) {
        throw new HomeHeroValidationError("Select a published artwork that has an image");
      }
      settings.heroBackgroundSource = "artwork";
      settings.heroBackgroundArtworkId = artwork._id;
      clearUploadedHeroFields(settings);
    } else if (values.heroBackgroundSource === "upload") {
      if (!getOwnedHeroUpload(settings)) {
        throw new HomeHeroValidationError("Upload a dedicated Hero photo first");
      }
      settings.heroBackgroundSource = "upload";
      settings.heroBackgroundArtworkId = null;
    } else {
      settings.heroBackgroundSource = "none";
      settings.heroBackgroundArtworkId = null;
      clearUploadedHeroFields(settings);
    }

    await settings.save();
    const publicSync = await syncPublicData("home-hero-updated");
    if (publicSync.success && previousUpload && settings.heroBackgroundSource !== "upload") {
      await destroyOwnedHeroUpload(previousUpload);
    }

    res.json({
      success: true,
      message: values.heroBackgroundSource === "none"
        ? "Home Hero background removed"
        : "Home Hero updated",
      settings: await settingsResponse(settings),
      publicSync,
    });
  } catch (error) {
    console.error("Update Home Hero error:", error);
    res.status(error instanceof HomeHeroValidationError || error?.name === "ValidationError" ? 400 : 500)
      .json({ success: false, message: error.message || "Server error" });
  }
});

// @route   PUT /api/settings/home/background
// @desc    Upload/replace a dedicated Home Hero photo and save Hero content
// @access  Private
router.put("/home/background", protect, adminOnly, uploadHomeHero.single("image"), async (req, res) => {
  let newUpload = null;
  let newUploadSaved = false;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Select a Hero background image" });
    }

    newUpload = getCloudinaryFileInfo(req.file);
    if (!newUpload.url || !newUpload.publicId || !isOwnedHeroUpload(newUpload.publicId)) {
      await destroyOwnedHeroUpload(newUpload);
      return res.status(500).json({ success: false, message: "Hero background upload failed" });
    }

    const values = normalizeHomeHeroPayload({
      ...req.body,
      heroBackgroundSource: "upload",
    });
    const settings = await getOrCreateSettings();
    const previousUpload = getOwnedHeroUpload(settings);

    applyHomeHeroContent(settings, values);
    settings.heroBackgroundSource = "upload";
    settings.heroBackgroundUrl = newUpload.url;
    settings.heroBackgroundPublicId = newUpload.publicId;
    settings.heroBackgroundWidth = newUpload.width || null;
    settings.heroBackgroundHeight = newUpload.height || null;
    settings.heroBackgroundArtworkId = null;
    await settings.save();
    newUploadSaved = true;

    const publicSync = await syncPublicData("home-hero-image-updated");
    if (publicSync.success && previousUpload?.publicId && previousUpload.publicId !== newUpload.publicId) {
      await destroyOwnedHeroUpload(previousUpload);
    }

    res.json({
      success: true,
      message: previousUpload ? "Home Hero photo replaced" : "Home Hero photo uploaded",
      settings: await settingsResponse(settings),
      publicSync,
    });
  } catch (error) {
    if (!newUploadSaved && newUpload?.publicId) await destroyOwnedHeroUpload(newUpload);
    console.error("Upload Home Hero error:", error);
    res.status(error instanceof HomeHeroValidationError || error?.name === "ValidationError" ? 400 : 500)
      .json({ success: false, message: error.message || "Server error" });
  }
});

// @route   PUT /api/settings
// @desc    Update website settings (admin)
// @access  Private
router.put("/", protect, adminOnly, async (req, res) => {
  try {
    const {
      websiteTitle,
      websiteDescription,
      footerText,
      heroEyebrow,
      heroHeading,
      heroHeadingAccent,
      heroSubtitle,
      heroPrimaryButtonText,
      heroSecondaryButtonText,
      themePreset,
      primaryColor,
      secondaryColor,
      accentColor,
      backgroundColor,
      surfaceColor,
      textColor,
      mutedTextColor,
      borderColor,
      buttonRadius,
      cardRadius,
      themeMode,
      maintenanceMode,
      seoTitle,
      seoDescription,
      seoKeywords,
      contactEmail,
      contactPhone,
      contactAddress,
      instagram,
      facebook,
      youtube,
      whatsapp,
      expectedResponseTime,
      privacyReassurance,
      studioVisitInformation,
      additionalSocialLinks,
    } = req.body;

    const settings = await getOrCreateSettings();

    if (websiteTitle !== undefined) settings.websiteTitle = websiteTitle;
    if (websiteDescription !== undefined) settings.websiteDescription = websiteDescription;
    if (footerText !== undefined) settings.footerText = footerText;
    if (heroEyebrow !== undefined) settings.heroEyebrow = heroEyebrow;
    if (heroHeading !== undefined) settings.heroHeading = heroHeading;
    if (heroHeadingAccent !== undefined) settings.heroHeadingAccent = heroHeadingAccent;
    if (heroSubtitle !== undefined) settings.heroSubtitle = heroSubtitle;
    if (heroPrimaryButtonText !== undefined) settings.heroPrimaryButtonText = heroPrimaryButtonText;
    if (heroSecondaryButtonText !== undefined) settings.heroSecondaryButtonText = heroSecondaryButtonText;
    if (themePreset !== undefined) settings.themePreset = themePreset;
    if (primaryColor !== undefined) settings.primaryColor = primaryColor;
    if (secondaryColor !== undefined) settings.secondaryColor = secondaryColor;
    if (accentColor !== undefined) settings.accentColor = accentColor;
    if (backgroundColor !== undefined) settings.backgroundColor = backgroundColor;
    if (surfaceColor !== undefined) settings.surfaceColor = surfaceColor;
    if (textColor !== undefined) settings.textColor = textColor;
    if (mutedTextColor !== undefined) settings.mutedTextColor = mutedTextColor;
    if (borderColor !== undefined) settings.borderColor = borderColor;
    if (buttonRadius !== undefined) settings.buttonRadius = buttonRadius;
    if (cardRadius !== undefined) settings.cardRadius = cardRadius;
    if (themeMode !== undefined) settings.themeMode = themeMode;
    if (maintenanceMode !== undefined) {
      settings.maintenanceMode = maintenanceMode === true || maintenanceMode === "true";
    }
    if (seoTitle !== undefined) settings.seoTitle = seoTitle;
    if (seoDescription !== undefined) settings.seoDescription = seoDescription;
    if (seoKeywords !== undefined) settings.seoKeywords = seoKeywords;
    if (contactEmail !== undefined) settings.contactEmail = contactEmail;
    if (contactPhone !== undefined) settings.contactPhone = normalizePhone(contactPhone);
    if (contactAddress !== undefined) settings.contactAddress = contactAddress;
    if (instagram !== undefined) settings.instagram = normalizeUrl(instagram);
    if (facebook !== undefined) settings.facebook = normalizeUrl(facebook);
    if (youtube !== undefined) settings.youtube = normalizeUrl(youtube);
    if (whatsapp !== undefined) settings.whatsapp = normalizePhone(whatsapp);
    if (expectedResponseTime !== undefined) settings.expectedResponseTime = String(expectedResponseTime).trim();
    if (privacyReassurance !== undefined) settings.privacyReassurance = String(privacyReassurance).trim();
    if (studioVisitInformation !== undefined) settings.studioVisitInformation = String(studioVisitInformation).trim();
    if (additionalSocialLinks !== undefined) {
      if (!Array.isArray(additionalSocialLinks) || additionalSocialLinks.length > 12) throw new Error("Additional social links must be a list of at most 12 links");
      settings.additionalSocialLinks = additionalSocialLinks
        .map((link) => ({ label: String(link?.label || "").trim().slice(0, 60), url: normalizeUrl(link?.url || "") }))
        .filter((link) => link.label && link.url);
    }

    await settings.save();

    const publicSync = await syncPublicData("settings-updated");
    res.json({ success: true, message: "Settings updated", settings: await settingsResponse(settings), publicSync });
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(error?.name === "TypeError" || /valid|Social links/.test(error.message) ? 400 : 500).json({ success: false, message: error.message || "Server error" });
  }
});

// @route   PUT /api/settings/logo
// @desc    Upload/update website logo (admin)
// @access  Private
router.put("/logo", protect, adminOnly, uploadLogo.single("logo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No logo uploaded" });
    }

    const settings = await getOrCreateSettings();
    const previousLogoPublicId = settings.logoPublicId;

    const uploadedLogo = getCloudinaryFileInfo(req.file);
    if (!uploadedLogo.url || !uploadedLogo.publicId) {
      return res.status(500).json({ success: false, message: "Logo upload failed" });
    }

    settings.logoUrl = uploadedLogo.url;
    settings.logoPublicId = uploadedLogo.publicId;
    await settings.save();

    const publicSync = await syncPublicData("logo-updated");
    if (publicSync.success && previousLogoPublicId && previousLogoPublicId !== uploadedLogo.publicId) {
      await cloudinary.uploader.destroy(previousLogoPublicId).catch((error) => {
        console.error("Previous logo cleanup failed:", { name: error?.name });
      });
    }
    res.json({ success: true, message: "Logo updated", settings: await settingsResponse(settings), publicSync });
  } catch (error) {
    console.error("Logo upload error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.use((error, req, res, next) => {
  if (error?.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: error.code === "LIMIT_FILE_SIZE"
        ? "Hero background images must be 12 MB or smaller"
        : error.message,
    });
  }
  next(error);
});

module.exports = router;
