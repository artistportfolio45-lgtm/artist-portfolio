// routes/settings.js
// Website settings — public read, admin update

const express = require("express");
const router = express.Router();
const Settings = require("../models/Settings");
const { protect } = require("../middleware/auth");
const { uploadLogo, cloudinary, getCloudinaryFileInfo } = require("../config/cloudinary");

// Helper: get or create the single settings document
const getOrCreateSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
};

// @route   GET /api/settings
// @desc    Get website settings (public)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   PUT /api/settings
// @desc    Update website settings (admin)
// @access  Private
router.put("/", protect, async (req, res) => {
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
    if (contactPhone !== undefined) settings.contactPhone = contactPhone;
    if (contactAddress !== undefined) settings.contactAddress = contactAddress;
    if (instagram !== undefined) settings.instagram = instagram;
    if (facebook !== undefined) settings.facebook = facebook;
    if (youtube !== undefined) settings.youtube = youtube;
    if (whatsapp !== undefined) settings.whatsapp = whatsapp;

    await settings.save();

    res.json({ success: true, message: "Settings updated", settings });
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   PUT /api/settings/logo
// @desc    Upload/update website logo (admin)
// @access  Private
router.put("/logo", protect, uploadLogo.single("logo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No logo uploaded" });
    }

    const settings = await getOrCreateSettings();

    // Delete old logo from Cloudinary
    if (settings.logoPublicId) {
      await cloudinary.uploader.destroy(settings.logoPublicId);
    }

    const uploadedLogo = getCloudinaryFileInfo(req.file);
    if (!uploadedLogo.url || !uploadedLogo.publicId) {
      return res.status(500).json({ success: false, message: "Logo upload failed" });
    }

    settings.logoUrl = uploadedLogo.url;
    settings.logoPublicId = uploadedLogo.publicId;
    await settings.save();

    res.json({ success: true, message: "Logo updated", settings });
  } catch (error) {
    console.error("Logo upload error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
