// routes/artworks.js
// Full CRUD for artworks — public read, admin write

const express = require("express");
const router = express.Router();
const Artwork = require("../models/Artwork");
const UploadBatch = require("../models/UploadBatch");
const { protect } = require("../middleware/auth");
const {
  uploadArtwork,
  uploadBulkArtwork,
  cloudinary,
  getCloudinaryFileInfo,
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
const dateBoundary = (value, endOfDay = false) => {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const discardUploadedImages = (images) =>
  Promise.allSettled(images.map((image) => cloudinary.uploader.destroy(image.publicId)));

const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ success: false, message: "Admin access required" });
  next();
};
const uploadedByValue = (user) => user?._id?.toString() || user?.email || undefined;

const titleFromFilename = (filename = "") => {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const readable = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!readable) return "Untitled";
  return readable.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const uploadBulkImage = (file, clientUploadId) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "artist-portfolio/artworks",
        resource_type: "image",
        quality: "auto",
        fetch_format: "auto",
        public_id: clientUploadId,
        unique_filename: false,
        overwrite: true,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(file.buffer);
  });


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
// @desc    Create one artwork per uploaded image, strictly sequentially
// @access  Private
router.post(
  "/bulk",
  protect,
  adminOnly,
  uploadBulkArtwork.array("images"),
  async (req, res) => {
    const files = req.files || [];
    const clientIds = Array.isArray(req.body?.clientIds)
      ? req.body.clientIds
      : req.body?.clientIds ? [req.body.clientIds] : [];
    const uploadBatchId = optionalText(req.body?.uploadBatchId) || undefined;
    const selectedCount = Math.max(files.length, Number.parseInt(req.body?.batchSize, 10) || 0);
    if (!files.length) {
      return res.status(400).json({ success: false, message: "Select at least one artwork image" });
    }
    if (clientIds.length !== files.length || clientIds.some((id) => !optionalText(id))) {
      return res.status(400).json({ success: false, message: "Every artwork requires a clientUploadId" });
    }
    if (uploadBatchId) {
      try {
        await UploadBatch.findOneAndUpdate(
          { uploadBatchId },
          { $max: { selectedCount }, $set: { uploadedBy: uploadedByValue(req.user) } },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        console.error("Upload batch initialization error:", error);
        return res.status(500).json({ success: false, message: "Could not initialize upload batch" });
      }
    }

    const results = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const baseResult = {
        index,
        filename: file.originalname,
        clientId: clientIds[index] || null,
      };

      let uploadedImage;
      try {
        const clientUploadId = clientIds[index] || undefined;
        const existing = await Artwork.findOne({ clientUploadId });
        if (existing) {
          results.push({ ...baseResult, clientId: clientUploadId, status: "successful", message: "Artwork was already uploaded.", artwork: existing });
          continue;
        }
        const uploaded = await uploadBulkImage(file, clientUploadId);
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
          clientUploadId,
          uploadBatchId,
          uploadStatus: "success",
          uploadedBy: uploadedByValue(req.user),
        });
        results.push({ ...baseResult, status: "successful", artwork });
      } catch (error) {
        if (error?.code === 11000 && clientIds[index]) {
          const existing = await Artwork.findOne({ clientUploadId: clientIds[index] });
          if (existing) {
            if (uploadedImage?.publicId) await cloudinary.uploader.destroy(uploadedImage.publicId).catch(() => {});
            results.push({ ...baseResult, status: "successful", message: "Artwork was already uploaded.", artwork: existing });
            continue;
          }
        }
        if (uploadedImage?.publicId) {
          await cloudinary.uploader.destroy(uploadedImage.publicId).catch(() => {});
        }
        console.error("Bulk artwork upload item failed:", error);
        results.push({
          ...baseResult,
          status: "failed",
          error: "This image could not be uploaded. Please retry it.",
        });
        continue;
      }
    }

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

// @route   GET /api/artworks/upload-status/:clientUploadId
router.get("/upload-status/:clientUploadId", protect, adminOnly, async (req, res) => {
  try {
    const artwork = await Artwork.findOne({ clientUploadId: req.params.clientUploadId })
      .select("_id title images createdAt uploadStatus");
    return res.json({ success: true, exists: Boolean(artwork), ...(artwork ? { artwork } : {}) });
  } catch (error) {
    console.error("Upload status error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   GET /api/artworks/upload-history
router.get("/upload-history", protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, batchId, startDate, endDate } = req.query;
    const query = {};
    if (search) query.title = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (status === "success") query.$or = [{ uploadStatus: "success" }, { uploadStatus: { $exists: false } }];
    if (status === "failed") query.uploadStatus = "failed";
    if (batchId) query.uploadBatchId = batchId;
    if (startDate || endDate) {
      query.createdAt = {};
      const start = dateBoundary(startDate);
      const end = dateBoundary(endDate, true);
      if (start) query.createdAt.$gte = start;
      if (end) query.createdAt.$lte = end;
    }
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const [artworks, total] = await Promise.all([
      Artwork.find(query)
        .select("_id title category images createdAt updatedAt uploadedBy uploadBatchId uploadStatus")
        .sort({ createdAt: -1 }).skip((currentPage - 1) * pageSize).limit(pageSize).lean(),
      Artwork.countDocuments(query),
    ]);
    res.json({ success: true, artworks, pagination: { total, page: currentPage, limit: pageSize, pages: Math.ceil(total / pageSize) } });
  } catch (error) { console.error("Upload history error:", error); res.status(500).json({ success: false, message: "Server error" }); }
});

router.get("/upload-history/batches", protect, adminOnly, async (req, res) => {
  try {
    const [artworkBatches, savedBatches] = await Promise.all([Artwork.aggregate([
      { $match: { uploadBatchId: { $exists: true, $ne: "" } } },
      { $group: { _id: "$uploadBatchId", uploadedAt: { $max: "$createdAt" }, total: { $sum: 1 }, successful: { $sum: { $cond: [{ $eq: ["$uploadStatus", "success"] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ["$uploadStatus", "failed"] }, 1, 0] } }, uploadedBy: { $first: "$uploadedBy" } } },
      { $sort: { uploadedAt: -1 } },
    ]), UploadBatch.find().sort({ createdAt: -1 }).lean()]);
    const summaries = new Map(savedBatches.map((batch) => [batch.uploadBatchId, batch]));
    const batches = artworkBatches.map(({ _id, ...batch }) => {
      const saved = summaries.get(_id);
      summaries.delete(_id);
      return {
        uploadBatchId: _id,
        ...batch,
        uploadedAt: saved?.createdAt || batch.uploadedAt,
        total: saved?.selectedCount || batch.total,
        successful: saved?.successfulCount || batch.successful,
        failed: saved?.failedCount || batch.failed,
        uploadedBy: saved?.uploadedBy || batch.uploadedBy,
      };
    });
    for (const saved of summaries.values()) batches.push({
      uploadBatchId: saved.uploadBatchId,
      uploadedAt: saved.createdAt,
      total: saved.selectedCount,
      successful: saved.successfulCount,
      failed: saved.failedCount,
      uploadedBy: saved.uploadedBy,
    });
    batches.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json({ success: true, batches });
  } catch (error) { res.status(500).json({ success: false, message: "Server error" }); }
});

router.put("/upload-history/batches/:uploadBatchId", protect, adminOnly, async (req, res) => {
  try {
    const selectedCount = Math.max(0, Number.parseInt(req.body.selected, 10) || 0);
    const successfulCount = Math.max(0, Number.parseInt(req.body.successful, 10) || 0);
    const failedCount = Math.max(0, Number.parseInt(req.body.failed, 10) || 0);
    const batch = await UploadBatch.findOneAndUpdate(
      { uploadBatchId: req.params.uploadBatchId },
      { selectedCount, successfulCount, failedCount, uploadedBy: uploadedByValue(req.user) },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
    res.json({ success: true, batch });
  } catch (error) {
    console.error("Upload batch summary error:", error);
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
router.post("/", protect, adminOnly, uploadArtwork.array("images", 10), async (req, res) => {
  let images = [];
  try {
    const { title, description, category, price, medium, dimensions, isAvailable, isFeatured, year, clientUploadId, uploadBatchId } = req.body;

    images = (req.files || []).map(getCloudinaryFileInfo).filter((img) => img.url && img.publicId);
    if (!optionalText(clientUploadId)) {
      await discardUploadedImages(images);
      return res.status(400).json({ success: false, message: "clientUploadId is required" });
    }
    if (clientUploadId) {
      const existing = await Artwork.findOne({ clientUploadId });
      if (existing) {
        await discardUploadedImages(images);
        return res.json({ success: true, message: "Artwork was already uploaded.", artwork: existing });
      }
    }

    // Map uploaded files to image objects
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
      clientUploadId: optionalText(clientUploadId) || undefined,
      uploadBatchId: optionalText(uploadBatchId) || undefined,
      uploadStatus: "success",
      uploadedBy: uploadedByValue(req.user),
    });

    res.status(201).json({ success: true, message: "Artwork created", artwork });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.clientUploadId && req.body?.clientUploadId) {
      const existing = await Artwork.findOne({ clientUploadId: req.body.clientUploadId });
      if (existing) {
        await discardUploadedImages(images);
        return res.json({ success: true, message: "Artwork was already uploaded.", artwork: existing });
      }
    }
    await discardUploadedImages(images);
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
router.post("/:id/images", protect, adminOnly, uploadArtwork.array("images", 10), async (req, res) => {
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

router.__testables = { titleFromFilename };

module.exports = router;
