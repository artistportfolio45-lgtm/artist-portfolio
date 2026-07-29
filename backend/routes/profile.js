// routes/profile.js
// Artist profile — public read, admin update

const express = require("express");
const router = express.Router();
const ArtistProfile = require("../models/ArtistProfile");
const { protect } = require("../middleware/auth");
const { uploadProfile, cloudinary, getCloudinaryFileInfo } = require("../config/cloudinary");

// Helper: get or create the single profile document
const getOrCreateProfile = async () => {
  let profile = await ArtistProfile.findOne();
  if (!profile) {
    profile = await ArtistProfile.create({});
  }
  return profile;
};

// @route   GET /api/profile
// @desc    Get artist profile (public)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const profile = await getOrCreateProfile();
    res.json({ success: true, profile });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   PUT /api/profile
// @desc    Update artist profile text fields (admin)
// @access  Private
router.put("/", protect, async (req, res) => {
  try {
    const { name, about, email, phone, whatsapp, instagram, facebook, youtube, address } = req.body;

    const profile = await getOrCreateProfile();

    if (name !== undefined) profile.name = name;
    if (about !== undefined) profile.about = about;
    if (email !== undefined) profile.email = email;
    if (phone !== undefined) profile.phone = phone;
    if (whatsapp !== undefined) profile.whatsapp = whatsapp;
    if (instagram !== undefined) profile.instagram = instagram;
    if (facebook !== undefined) profile.facebook = facebook;
    if (youtube !== undefined) profile.youtube = youtube;
    if (address !== undefined) profile.address = address;

    await profile.save();

    res.json({ success: true, message: "Profile updated", profile });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   PUT /api/profile/photo
// @desc    Upload/update profile photo (admin)
// @access  Private
router.put("/photo", protect, uploadProfile.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    const profile = await getOrCreateProfile();

    // Delete old photo from Cloudinary if exists
    if (profile.profilePhotoPublicId) {
      await cloudinary.uploader.destroy(profile.profilePhotoPublicId);
    }

    const uploadedPhoto = getCloudinaryFileInfo(req.file);
    if (!uploadedPhoto.url || !uploadedPhoto.publicId) {
      return res.status(500).json({ success: false, message: "Image upload failed" });
    }

    profile.profilePhoto = uploadedPhoto.url;
    profile.profilePhotoPublicId = uploadedPhoto.publicId;
    await profile.save();

    res.json({ success: true, message: "Profile photo updated", profile });
  } catch (error) {
    console.error("Photo upload error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
