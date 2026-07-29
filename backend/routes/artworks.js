// routes/artworks.js
// Full CRUD for artworks — public read, admin write

const express = require("express");
const router = express.Router();
const Artwork = require("../models/Artwork");
const { protect } = require("../middleware/auth");
const { uploadRateLimiter } = require("../middleware/rateLimiter");
const { uploadArtwork, cloudinary, getCloudinaryFileInfo } = require("../config/cloudinary");

// ─── PUBLIC ROUTES ──────────────────────────────────────────────────────────

// @route   GET /api/artworks
// @desc    Get all artworks with optional search & filters
// @access  Public
router.get("/", async (req, res) => {
  try {
    const {
      search,
      category,
      available,
      featured,
      page = 1,
      limit = 12,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    const query = {};

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    // Category filter
    if (category && category !== "all") {
      query.category = { $regex: category, $options: "i" };
    }

    // Availability filter
    if (available === "true") query.isAvailable = true;
    if (available === "false") query.isAvailable = false;

    // Featured filter
    if (featured === "true") query.isFeatured = true;

    const safeSortFields = new Set([
      "createdAt",
      "updatedAt",
      "title",
      "category",
      "price",
      "year",
      "isAvailable",
      "isFeatured",
    ]);
    const sortField = safeSortFields.has(sort) ? sort : "createdAt";
    const sortDirection = order === "asc" ? 1 : -1;
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNumber - 1) * pageSize;

    const [artworks, total] = await Promise.all([
      Artwork.find(query)
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(pageSize),
      Artwork.countDocuments(query),
    ]);

    res.json({
      success: true,
      artworks,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Get artworks error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   GET /api/artworks/categories
// @desc    Get distinct categories
// @access  Public
router.get("/categories", async (req, res) => {
  try {
    const categories = await Artwork.distinct("category");
    res.json({ success: true, categories: categories.filter(Boolean).sort() });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   GET /api/artworks/:id
// @desc    Get single artwork by ID
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ success: false, message: "Artwork not found" });
    }
    res.json({ success: true, artwork });
  } catch (error) {
    console.error("Get artwork error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

// @route   POST /api/artworks
// @desc    Create new artwork with images
// @access  Private
router.post("/", uploadRateLimiter, protect, uploadArtwork.array("images", 10), async (req, res) => {
  try {
    const { title, description, category, price, medium, dimensions, isAvailable, isFeatured, year } = req.body;

    if (!title || !category || price === undefined) {
      return res.status(400).json({ success: false, message: "Title, category, and price are required" });
    }

    // Map uploaded files to image objects
    const images = (req.files || []).map(getCloudinaryFileInfo).filter((img) => img.url && img.publicId);

    if (images.length === 0) {
      return res.status(400).json({ success: false, message: "Please upload at least one artwork image" });
    }

    const artwork = await Artwork.create({
      title,
      description,
      category,
      price: parseFloat(price),
      medium,
      dimensions,
      isAvailable: isAvailable === "false" ? false : true,
      isFeatured: isFeatured === "true",
      year: year ? parseInt(year) : null,
      images,
    });

    res.status(201).json({ success: true, message: "Artwork created", artwork });
  } catch (error) {
    console.error("Create artwork error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   PUT /api/artworks/:id
// @desc    Update artwork metadata
// @access  Private
router.put("/:id", protect, async (req, res) => {
  try {
    const { title, description, category, price, medium, dimensions, isAvailable, isFeatured, year } = req.body;

    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ success: false, message: "Artwork not found" });
    }

    if (title !== undefined) artwork.title = title;
    if (description !== undefined) artwork.description = description;
    if (category !== undefined) artwork.category = category;
    if (price !== undefined) artwork.price = parseFloat(price);
    if (medium !== undefined) artwork.medium = medium;
    if (dimensions !== undefined) artwork.dimensions = dimensions;
    if (isAvailable !== undefined) artwork.isAvailable = isAvailable === "false" ? false : Boolean(isAvailable);
    if (isFeatured !== undefined) artwork.isFeatured = isFeatured === "true" || isFeatured === true;
    if (year !== undefined) artwork.year = year ? parseInt(year) : null;

    await artwork.save();
    res.json({ success: true, message: "Artwork updated", artwork });
  } catch (error) {
    console.error("Update artwork error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   POST /api/artworks/:id/images
// @desc    Add images to existing artwork
// @access  Private
router.post("/:id/images", uploadRateLimiter, protect, uploadArtwork.array("images", 10), async (req, res) => {
  try {
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ success: false, message: "Artwork not found" });
    }

    const newImages = (req.files || []).map(getCloudinaryFileInfo).filter((img) => img.url && img.publicId);

    if (newImages.length === 0) {
      return res.status(400).json({ success: false, message: "Please upload at least one artwork image" });
    }

    artwork.images.push(...newImages);
    await artwork.save();

    res.json({ success: true, message: "Images added", artwork });
  } catch (error) {
    console.error("Add images error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   DELETE /api/artworks/:id/images/:publicId
// @desc    Remove a specific image from artwork
// @access  Private
router.delete("/:id/images/:publicId", protect, async (req, res) => {
  try {
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ success: false, message: "Artwork not found" });
    }

    // URL-decode the publicId (Cloudinary IDs may contain slashes)
    const publicId = decodeURIComponent(req.params.publicId);

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Remove from images array
    artwork.images = artwork.images.filter((img) => img.publicId !== publicId);
    await artwork.save();

    res.json({ success: true, message: "Image removed", artwork });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   DELETE /api/artworks/:id
// @desc    Delete artwork and all its Cloudinary images
// @access  Private
router.delete("/:id", protect, async (req, res) => {
  try {
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ success: false, message: "Artwork not found" });
    }

    // Delete all images from Cloudinary
    const deletePromises = artwork.images.map((img) =>
      cloudinary.uploader.destroy(img.publicId)
    );
    await Promise.all(deletePromises);

    await artwork.deleteOne();

    res.json({ success: true, message: "Artwork deleted" });
  } catch (error) {
    console.error("Delete artwork error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
