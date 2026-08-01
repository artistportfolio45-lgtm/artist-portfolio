// routes/artworks.js
// Full CRUD for artworks — public read, admin write

const express = require("express");
const router = express.Router();
const Artwork = require("../models/Artwork");
const { protect } = require("../middleware/auth");
const { uploadRateLimiter } = require("../middleware/rateLimiter");
const {
  uploadArtwork,
  uploadBulkArtwork,
  cloudinary,
  getCloudinaryFileInfo,
  MAX_BULK_ARTWORKS,
} = require("../config/cloudinary");

const optionalText = (value) => (typeof value === "string" ? value.trim() : "");
const normalizePrice = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return Number(value);
};
const normalizeYear = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return Number(value);
};
const invalidPrice = (value) => value !== null && (!Number.isFinite(value) || value < 0);
const invalidYear = (value) => value !== null && (!Number.isInteger(value) || value < 0);
const discardUploadedImages = (images) =>
  Promise.allSettled(images.map((image) => cloudinary.uploader.destroy(image.publicId)));
const BULK_UPLOAD_CONCURRENCY = 4;

const titleFromFilename = (filename = "") => {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const readable = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!readable) return "Untitled";
  return readable.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const uploadBulkImage = (file) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "artist-portfolio/artworks",
        resource_type: "image",
        quality: "auto",
        fetch_format: "auto",
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(file.buffer);
  });

const runWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
};

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
      if (category.trim().toLowerCase() === "uncategorized") {
        query.$or = [
          { category: { $regex: /^uncategorized$/i } },
          { category: { $exists: false } },
          { category: null },
          { category: "" },
        ];
      } else {
        query.category = { $regex: category, $options: "i" };
      }
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
    const [categories, incompleteCount] = await Promise.all([
      Artwork.distinct("category"),
      Artwork.countDocuments({
        $or: [
          { category: { $exists: false } },
          { category: null },
          { category: "" },
        ],
      }),
    ]);
    const normalized = categories.map((item) => item?.trim()).filter(Boolean);
    if (incompleteCount > 0) normalized.push("Uncategorized");
    res.json({ success: true, categories: [...new Set(normalized)].sort() });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   POST /api/artworks/bulk
// @desc    Create one artwork per uploaded image, with bounded Cloudinary concurrency
// @access  Private
router.post(
  "/bulk",
  uploadRateLimiter,
  protect,
  uploadBulkArtwork.array("images", MAX_BULK_ARTWORKS),
  async (req, res) => {
    const files = req.files || [];
    const clientIds = Array.isArray(req.body?.clientIds)
      ? req.body.clientIds
      : req.body?.clientIds ? [req.body.clientIds] : [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: "Select at least one artwork image" });
    }

    const results = await runWithConcurrency(files, BULK_UPLOAD_CONCURRENCY, async (file, index) => {
      const baseResult = {
        index,
        filename: file.originalname,
        clientId: clientIds[index] || null,
      };

      let uploadedImage;
      try {
        const uploaded = await uploadBulkImage(file);
        uploadedImage = {
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          ...(Number(uploaded.width) > 0 ? { width: Number(uploaded.width) } : {}),
          ...(Number(uploaded.height) > 0 ? { height: Number(uploaded.height) } : {}),
        };
        const artwork = await Artwork.create({
          title: titleFromFilename(file.originalname),
          description: "",
          category: "Uncategorized",
          price: null,
          medium: "",
          dimensions: "",
          isAvailable: true,
          isFeatured: false,
          year: null,
          images: [uploadedImage],
        });
        return { ...baseResult, status: "successful", artwork };
      } catch (error) {
        if (uploadedImage?.publicId) {
          await cloudinary.uploader.destroy(uploadedImage.publicId).catch(() => {});
        }
        console.error("Bulk artwork upload item failed:", error);
        return {
          ...baseResult,
          status: "failed",
          error: "This image could not be uploaded. Please retry it.",
        };
      }
    });

    const successful = results.filter((item) => item.status === "successful").length;
    const failed = results.length - successful;
    res.status(failed ? 207 : 201).json({
      success: failed === 0,
      message: failed ? "Some artworks could not be uploaded" : "Artworks uploaded",
      total: results.length,
      successful,
      failed,
      results,
    });
  }
);

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

    // Map uploaded files to image objects
    const images = (req.files || []).map(getCloudinaryFileInfo).filter((img) => img.url && img.publicId);

    if (images.length === 0) {
      return res.status(400).json({ success: false, message: "Please upload at least one artwork image" });
    }

    const normalizedPrice = normalizePrice(price);
    if (invalidPrice(normalizedPrice)) {
      await discardUploadedImages(images);
      return res.status(400).json({
        success: false,
        message: "Price must be a valid non-negative number",
      });
    }

    const normalizedYear = normalizeYear(year);
    if (invalidYear(normalizedYear)) {
      await discardUploadedImages(images);
      return res.status(400).json({
        success: false,
        message: "Year must be a valid non-negative whole number",
      });
    }

    const artwork = await Artwork.create({
      title: optionalText(title) || titleFromFilename(req.files[0]?.originalname),
      description: optionalText(description),
      category: optionalText(category) || "Uncategorized",
      price: normalizedPrice,
      medium: optionalText(medium),
      dimensions: optionalText(dimensions),
      isAvailable: isAvailable === "false" ? false : true,
      isFeatured: isFeatured === "true",
      year: normalizedYear,
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

    if (title !== undefined) artwork.title = optionalText(title) || "Untitled";
    if (description !== undefined) artwork.description = optionalText(description);
    if (category !== undefined) artwork.category = optionalText(category) || "Uncategorized";
    if (price !== undefined) {
      const normalizedPrice = normalizePrice(price);
      if (invalidPrice(normalizedPrice)) {
        return res.status(400).json({
          success: false,
          message: "Price must be a valid non-negative number",
        });
      }
      artwork.price = normalizedPrice;
    }
    if (medium !== undefined) artwork.medium = optionalText(medium);
    if (dimensions !== undefined) artwork.dimensions = optionalText(dimensions);
    if (isAvailable !== undefined) artwork.isAvailable = isAvailable === "false" ? false : Boolean(isAvailable);
    if (isFeatured !== undefined) artwork.isFeatured = isFeatured === "true" || isFeatured === true;
    if (year !== undefined) {
      const normalizedYear = normalizeYear(year);
      if (invalidYear(normalizedYear)) {
        return res.status(400).json({
          success: false,
          message: "Year must be a valid non-negative whole number",
        });
      }
      artwork.year = normalizedYear;
    }

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

// Keep upload validation failures actionable instead of returning the generic server error.
router.use((error, req, res, next) => {
  if (error?.name === "MulterError") {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Each artwork image must be 10 MB or smaller"
      : error.message || "Invalid artwork image upload";
    return res.status(400).json({ success: false, message });
  }
  return next(error);
});

router.__testables = { titleFromFilename, runWithConcurrency, BULK_UPLOAD_CONCURRENCY };

module.exports = router;
