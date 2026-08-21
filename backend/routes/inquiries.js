// routes/inquiries.js
// Visitors submit inquiries; admin reads, marks, deletes

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Inquiry = require("../models/Inquiry");
const Artwork = require("../models/Artwork");
const { protect } = require("../middleware/auth");
const adminOnly = (req, res, next) => req.user?.role === "admin"
  ? next()
  : res.status(403).json({ success: false, message: "Admin access required" });

const trimOptional = (value) => (typeof value === "string" ? value.trim() : "");
const escapeRegex = (value) => trimOptional(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validInquiryId = (value) => mongoose.isValidObjectId(value);

// @route   POST /api/inquiries
// @desc    Submit an inquiry (public)
// @access  Public
router.post("/", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      subject,
      message,
      inquiryType,
      artwork,
      artworkId,
      artworkInterested,
      artworkTitle: submittedArtworkTitle,
      artworkUrl,
      sourcePage,
    } = req.body;

    if ([name, email, message].some((value) => typeof value !== "string") || !name.trim() || !email.trim() || !message.trim()) {
      return res.status(400).json({ success: false, message: "Name, email, and message are required" });
    }

    if (name.length > 120 || email.length > 254 || String(phone || "").length > 40 ||
        String(subject || "").length > 200 || message.length > 5000 || String(sourcePage || "").length > 500) {
      return res.status(400).json({ success: false, message: "Inquiry content is too long" });
    }

    // Email format check
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address" });
    }

    let artworkTitle = "";
    let artworkRef = null;
    const requestedArtworkId = artwork || artworkId || artworkInterested;

    if (requestedArtworkId) {
      if (!mongoose.Types.ObjectId.isValid(requestedArtworkId)) {
        return res.status(400).json({ success: false, message: "Invalid artwork selected" });
      }

      const artworkDoc = await Artwork.findById(requestedArtworkId).select("title");
      if (artworkDoc) {
        artworkTitle = artworkDoc.title;
        artworkRef = artworkDoc._id;
      }
    }

    const inquiry = await Inquiry.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: trimOptional(phone),
      subject: trimOptional(subject) || "General Enquiry",
      message: message.trim(),
      inquiryType: inquiryType === "artwork" || artworkRef ? "artwork" : "contact",
      artwork: artworkRef,
      artworkInterested: artworkRef,
      artworkTitle: artworkTitle || trimOptional(submittedArtworkTitle),
      artworkUrl: trimOptional(artworkUrl),
      sourcePage: trimOptional(sourcePage),
    });

    res.status(201).json({ success: true, message: "Inquiry submitted successfully" });
  } catch (error) {
    console.error("Submit inquiry error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   GET /api/inquiries
// @desc    Get all inquiries with optional search (admin)
// @access  Private
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const { search, isRead, page = 1, limit = 20 } = req.query;

    const query = {};
    const searchTerm = trimOptional(search).slice(0, 120);

    if (searchTerm) {
      const safeSearch = escapeRegex(searchTerm);
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { artworkTitle: { $regex: safeSearch, $options: "i" } },
        { message: { $regex: safeSearch, $options: "i" } },
      ];
    }

    if (isRead === "true") query.isRead = true;
    if (isRead === "false") query.isRead = false;

    const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const skip = (currentPage - 1) * pageSize;

    const [inquiries, total, unreadCount] = await Promise.all([
      Inquiry.find(query)
        .populate("artworkInterested", "title images")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      Inquiry.countDocuments(query),
      Inquiry.countDocuments({ isRead: false }),
    ]);

    res.json({
      success: true,
      inquiries,
      unreadCount,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Get inquiries error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   GET /api/inquiries/:id
// @desc    Get single inquiry (admin)
// @access  Private
router.get("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    const inquiry = await Inquiry.findById(req.params.id).populate("artworkInterested", "title images");
    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }
    res.json({ success: true, inquiry });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   PATCH /api/inquiries/:id/read
// @desc    Toggle read/unread status (admin)
// @access  Private
router.patch("/:id/read", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    inquiry.isRead = !inquiry.isRead;
    await inquiry.save();

    res.json({ success: true, message: `Marked as ${inquiry.isRead ? "read" : "unread"}`, inquiry });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   DELETE /api/inquiries/:id
// @desc    Delete inquiry (admin)
// @access  Private
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    const inquiry = await Inquiry.findByIdAndDelete(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }
    res.json({ success: true, message: "Inquiry deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
