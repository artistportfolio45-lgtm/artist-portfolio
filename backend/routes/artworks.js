// routes/artworks.js
// Full CRUD for artworks — public read, admin write

const express = require("express");
const mongoose = require("mongoose");
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
const { syncPublicData } = require("../utils/publicDataSync");
const { cleanTextList, sanitizePublicArtwork } = require("../utils/publicArtwork");
const {
  MAX_SEARCH_QUERY_LENGTH,
  prepareSearchQuery,
  searchAndRankArtworks,
} = require("../utils/artworkSearch");
const {
  cancelArtworkDeletionJob,
  createArtworkDeletionJob,
  getArtworkDeletionJob,
  startArtworkDeletionJob,
} = require("../utils/artworkDeletionJobs");
const { buildDuplicateGroups, duplicateReason, sha256 } = require("../utils/artworkDuplicates");

const optionalText = (value) => (typeof value === "string" ? value.trim() : "");
const escapeRegex = (value) => optionalText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const boundedFilterText = (value) => optionalText(value).slice(0, MAX_SEARCH_QUERY_LENGTH);
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
const compareArtworkValues = (first, second, sortField, sortDirection) => {
  const firstValue = first?.[sortField];
  const secondValue = second?.[sortField];
  if (["price", "year"].includes(sortField)) {
    const firstMissing = firstValue === null || firstValue === undefined || firstValue === "";
    const secondMissing = secondValue === null || secondValue === undefined || secondValue === "";
    if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;
    if (!firstMissing && Number(firstValue) !== Number(secondValue)) {
      return (Number(firstValue) - Number(secondValue)) * sortDirection;
    }
  } else if (["isAvailable", "isFeatured"].includes(sortField)) {
    const difference = Number(Boolean(firstValue)) - Number(Boolean(secondValue));
    if (difference) return difference * sortDirection;
  } else if (["createdAt", "updatedAt"].includes(sortField)) {
    const difference = new Date(firstValue || 0) - new Date(secondValue || 0);
    if (difference) return difference * sortDirection;
  } else {
    const difference = String(firstValue || "").localeCompare(String(secondValue || ""));
    if (difference) return difference * sortDirection;
  }
  return String(first?._id || "").localeCompare(String(second?._id || "")) * sortDirection;
};
const dateBoundary = (value, endOfDay = false) => {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const discardUploadedImages = (images) =>
  Promise.allSettled(images.map((image) => cloudinary.uploader.destroy(image.publicId)));
const imagePublicIdsFor = (artworks) =>
  artworks.flatMap((artwork) => {
    if (!Array.isArray(artwork?.images)) return [];
    return artwork.images
      .map((image) => image?.publicId)
      .filter((publicId) => typeof publicId === "string" && publicId.trim())
      .map((publicId) => publicId.trim());
  });
const deleteCloudinaryImages = async (publicIds) => {
  const uniquePublicIds = [...new Set(publicIds.filter(Boolean))];
  const results = await Promise.allSettled(
    uniquePublicIds.map(async (publicId) => {
      const result = await cloudinary.uploader.destroy(publicId);
      if (result?.result && !["ok", "not found"].includes(result.result)) {
        throw new Error(`Cloudinary returned ${result.result}`);
      }
      return { publicId, result: result?.result || "ok" };
    })
  );
  const failures = results
    .map((result, index) =>
      result.status === "rejected"
        ? { publicId: uniquePublicIds[index], message: result.reason?.message || "Cloudinary deletion failed" }
        : null
    )
    .filter(Boolean);
  return { failures, deleted: uniquePublicIds.length - failures.length };
};
const safeSyncPublicData = async (reason) => {
  try {
    return await syncPublicData(reason);
  } catch (error) {
    console.error("Public Gallery synchronization failed:", {
      reason,
      name: error?.name,
      message: error?.message,
    });
    return { success: false, message: "Artwork changes were saved, but public Gallery synchronization failed." };
  }
};
const deleteArtworkForJob = async (id) => {
  const artwork = await Artwork.findById(id);
  if (!artwork) return { status: "missing" };
  const publicIds = imagePublicIdsFor([artwork]);
  try {
    await artwork.deleteOne();
  } catch (error) {
    error.publicMessage = "Artwork database record could not be deleted; its images were kept";
    throw error;
  }
  return { status: "deleted", cleanup: { publicIds } };
};
const cleanupDeletedArtworkImages = async ({ publicIds = [] } = {}) => {
  const result = await deleteCloudinaryImages(publicIds);
  if (result.failures.length) {
    const error = new Error("Cloudinary cleanup failed");
    error.publicMessage = "Artwork was removed from the Gallery, but one or more Cloudinary images could not be deleted";
    throw error;
  }
  return result;
};
const validateBulkDeleteIds = (body) => {
  if (!body || typeof body !== "object") {
    return { valid: false, status: 400, message: "Request body is required" };
  }
  if (!Object.prototype.hasOwnProperty.call(body, "ids")) {
    return { valid: false, status: 400, message: "ids is required" };
  }
  if (!Array.isArray(body.ids)) {
    return { valid: false, status: 400, message: "ids must be an array" };
  }
  const ids = [...new Set(body.ids.map((id) => (typeof id === "string" ? id.trim() : String(id))))];
  if (!ids.length) {
    return { valid: false, status: 400, message: "Select at least one artwork to delete" };
  }
  const invalidIds = ids.filter((id) => !mongoose.isValidObjectId(id));
  if (invalidIds.length) {
    return { valid: false, status: 400, message: "One or more artwork IDs are invalid", invalidIds };
  }
  return { valid: true, ids };
};
const logBulkArtworkDeletionPlan = (artworks) => {
  artworks.forEach((artwork) => {
    const publicIds = imagePublicIdsFor([artwork]);
    console.log("Bulk delete artwork:", {
      id: artwork?._id?.toString(),
      hasCloudinaryPublicId: publicIds.length > 0,
      publicIdCount: publicIds.length,
    });
  });
};
const deleteArtworkDocumentsByIds = async (ids) => {
  const session = await mongoose.startSession();
  try {
    let deleteResult;
    await session.withTransaction(async () => {
      deleteResult = await Artwork.deleteMany({ _id: { $in: ids } }).session(session);
      if (deleteResult.deletedCount !== ids.length) {
        const error = new Error("Not every selected artwork could be deleted");
        error.status = 409;
        error.deletedCount = deleteResult.deletedCount;
        error.requestedCount = ids.length;
        throw error;
      }
    });
    return deleteResult;
  } finally {
    await session.endSession();
  }
};
const normalizeUploadBatchIds = (values) => [...new Set((Array.isArray(values) ? values : [values])
  .map((value) => optionalText(value))
  .filter((value) => value && value.length <= 160))];
const deleteUploadBatchHistory = async (values) => {
  const uploadBatchIds = normalizeUploadBatchIds(values);
  if (!uploadBatchIds.length) return { batchCount: 0, blockedBatchIds: [], remainingArtworkCount: 0 };
  const remainingCounts = await Artwork.aggregate([
    { $match: { uploadBatchId: { $in: uploadBatchIds } } },
    { $group: { _id: "$uploadBatchId", count: { $sum: 1 } } },
  ]);
  const remainingByBatch = new Map(remainingCounts.map((item) => [item._id, item.count]));
  const blockedBatchIds = uploadBatchIds.filter((batchId) => (remainingByBatch.get(batchId) || 0) > 0);
  const deletableBatchIds = uploadBatchIds.filter((batchId) => !blockedBatchIds.includes(batchId));
  if (!deletableBatchIds.length) {
    return {
      batchCount: 0,
      blockedBatchIds,
      remainingArtworkCount: blockedBatchIds.reduce((count, batchId) => count + (remainingByBatch.get(batchId) || 0), 0),
    };
  }
  const session = await mongoose.startSession();
  try {
    let batchCount = 0;
    await session.withTransaction(async () => {
      const removed = await UploadBatch.deleteMany({ uploadBatchId: { $in: deletableBatchIds } }, { session });
      batchCount = removed.deletedCount || 0;
    });
    return {
      batchCount,
      blockedBatchIds,
      remainingArtworkCount: blockedBatchIds.reduce((count, batchId) => count + (remainingByBatch.get(batchId) || 0), 0),
    };
  } finally {
    await session.endSession();
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ success: false, message: "Admin access required" });
  next();
};
const uploadedByValue = (user) => user?._id?.toString() || user?.email || undefined;
const validatePublishableArtwork = ({ title, description, year, images, catalogueNumber, allowLongDescription }) => {
  const errors = [];
  const currentYear = new Date().getFullYear();
  if (!optionalText(title) || optionalText(title).length > 180) errors.push("Published artwork requires a title of 180 characters or fewer");
  if (optionalText(description).length > 12000 && allowLongDescription !== true && allowLongDescription !== "true") errors.push("Description exceeds the 12,000 character publishing limit unless explicitly reviewed");
  if (year !== null && year !== undefined && (year < 1000 || year > currentYear + 1)) errors.push(`Year must be between 1000 and ${currentYear + 1}`);
  if (!Array.isArray(images) || images.length === 0) errors.push("Published artwork requires at least one image");
  if (optionalText(catalogueNumber).length > 100) errors.push("Catalogue number must be 100 characters or fewer");
  return errors;
};

const setArtworkNoStore = (req, res, next) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  next();
};

router.use(setArtworkNoStore);

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
        phash: true,
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
      collection,
      medium,
      year,
      decade,
      available,
      featured,
      page = 1,
      limit = 12,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    const query = { publicationStatus: { $nin: ["draft", "unpublished", "archived"] } };
    const preparedSearch = prepareSearchQuery(search);

    // Category filter
    if (category && category !== "all") {
      const safeCategory = boundedFilterText(category);
      if (safeCategory.toLowerCase() === "uncategorized") {
        query.$or = [
          { category: { $regex: /^uncategorized$/i } },
          { category: { $exists: false } },
          { category: null },
          { category: "" },
        ];
      } else {
        query.category = { $regex: `^${escapeRegex(safeCategory)}$`, $options: "i" };
      }
    }

    // Availability filter
    if (available === "true") query.isAvailable = true;
    if (available === "false") query.isAvailable = false;

    // Featured filter
    if (featured === "true") query.isFeatured = true;

    if (collection) query.collection = { $regex: escapeRegex(boundedFilterText(collection)), $options: "i" };
    if (medium) query.medium = { $regex: escapeRegex(boundedFilterText(medium)), $options: "i" };
    if (year && Number.isInteger(Number(year))) query.year = Number(year);
    if (decade && Number.isInteger(Number(decade))) {
      query.year = { $gte: Number(decade), $lte: Number(decade) + 9 };
    }

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
    let artworks;
    let total;

    if (preparedSearch.raw) {
      const candidates = await Artwork.find(query).lean({ versionKey: false });
      const ranked = searchAndRankArtworks(
        candidates,
        preparedSearch.raw,
        (first, second) => compareArtworkValues(first, second, sortField, sortDirection)
      );
      total = ranked.length;
      artworks = ranked.slice(skip, skip + pageSize);
    } else {
      [artworks, total] = await Promise.all([
        Artwork.find(query)
          .sort({ [sortField]: sortDirection, _id: sortDirection })
          .skip(skip)
          .limit(pageSize)
          .lean({ versionKey: false }),
        Artwork.countDocuments(query),
      ]);
    }

    res.json({
      success: true,
      artworks: artworks.map(sanitizePublicArtwork),
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
      Artwork.distinct("category", { publicationStatus: { $nin: ["draft", "unpublished", "archived"] } }),
      Artwork.countDocuments({
        publicationStatus: { $nin: ["draft", "unpublished", "archived"] },
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

// Admin collection includes every publication state; public endpoints never expose drafts.
router.get("/manage", protect, adminOnly, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const query = {};
    if (req.query.available === "true") query.isAvailable = true;
    if (req.query.available === "false") query.isAvailable = false;
    if (req.query.featured === "true") query.isFeatured = true;
    const [artworks, total] = await Promise.all([
      Artwork.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      Artwork.countDocuments(query),
    ]);
    res.json({ success: true, artworks, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/manage/:id", protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid artwork ID" });
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) return res.status(404).json({ success: false, message: "Artwork not found" });
    res.json({ success: true, artwork });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/:id/neighbors", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid artwork ID" });
    const current = await Artwork.findOne({ _id: req.params.id, publicationStatus: { $nin: ["draft", "unpublished", "archived"] } }).select("createdAt");
    if (!current) return res.status(404).json({ success: false, message: "Artwork not found" });
    const published = { publicationStatus: { $nin: ["draft", "unpublished", "archived"] } };
    const [previous, next] = await Promise.all([
      Artwork.findOne({ ...published, $or: [{ createdAt: { $lt: current.createdAt } }, { createdAt: current.createdAt, _id: { $lt: current._id } }] }).sort({ createdAt: -1, _id: -1 }).select("title images year catalogueNumber"),
      Artwork.findOne({ ...published, $or: [{ createdAt: { $gt: current.createdAt } }, { createdAt: current.createdAt, _id: { $gt: current._id } }] }).sort({ createdAt: 1, _id: 1 }).select("title images year catalogueNumber"),
    ]);
    res.json({ success: true, previous, next });
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
        const contentHash = sha256(file.buffer);
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
        const fingerprint = { contentHash, perceptualHash: optionalText(uploaded.phash).toLowerCase() };
        const duplicateCandidates = await Artwork.find({
          $or: [
            { contentHash },
            ...(fingerprint.perceptualHash ? [{ perceptualHash: { $exists: true, $ne: "" } }] : []),
          ],
        }).select("_id title images contentHash perceptualHash createdAt").lean();
        const duplicate = duplicateCandidates.find((candidate) => duplicateReason(fingerprint, candidate));
        if (duplicate) {
          await cloudinary.uploader.destroy(uploadedImage.publicId).catch(() => {});
          uploadedImage = null;
          results.push({
            ...baseResult,
            status: "duplicate",
            message: `Duplicate skipped: matches ${duplicate.title || "an existing artwork"}.`,
            duplicateOf: duplicate,
          });
          continue;
        }
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
          originalFilename: file.originalname,
          ...fingerprint,
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
    const duplicates = results.filter((item) => item.status === "duplicate").length;
    const failed = results.length - successful - duplicates;
    const publicSync = successful > 0 && req.query.deferPublicSync !== "true"
      ? await safeSyncPublicData("artwork-bulk-uploaded")
      : { success: successful === 0, deferred: successful > 0, message: successful > 0 ? "Public sync deferred" : "No successful artwork changes" };
    res.status(failed ? 207 : 201).json({
      success: failed === 0,
      message: failed ? "Some artworks could not be uploaded" : "Artworks uploaded",
      total: results.length,
      successful,
      duplicates,
      failed,
      results,
      publicSync,
    });
  }
);

// Duplicate analysis is deliberately non-destructive. It fingerprints legacy
// Cloudinary assets and reports which newer records can safely be removed.
router.post("/duplicates/scan", protect, adminOnly, async (req, res) => {
  try {
    const offset = Math.max(0, Number.parseInt(req.body?.offset, 10) || 0);
    const batchSize = Math.min(25, Math.max(1, Number.parseInt(req.body?.batchSize, 10) || 25));
    const scanQuery = { "images.0.publicId": { $exists: true } };
    const [total, artworks] = await Promise.all([Artwork.countDocuments(scanQuery), Artwork.find(scanQuery)
      .select("_id title images contentHash perceptualHash originalFilename createdAt")
      .sort({ createdAt: 1, _id: 1 })
      .skip(offset)
      .limit(batchSize)]);
    let fingerprinted = 0;
    let unavailable = 0;
    let cursor = 0;
    const fingerprintWorker = async () => {
      while (cursor < artworks.length) {
        const artwork = artworks[cursor++];
        if (artwork.perceptualHash && artwork.contentHash) continue;
        try {
          const resource = await cloudinary.api.resource(artwork.images[0].publicId, { phash: true });
          artwork.perceptualHash = optionalText(resource.phash).toLowerCase();
          artwork.contentHash = optionalText(resource.etag).toLowerCase() || artwork.contentHash;
          if (!artwork.originalFilename) artwork.originalFilename = optionalText(resource.original_filename);
          await artwork.save();
          fingerprinted += 1;
        } catch (error) {
          unavailable += 1;
    console.warn("Could not fingerprint artwork image:", {
            artworkId: String(artwork._id),
            message: error?.message || error?.error?.message || "Cloudinary returned an unknown error",
            httpCode: error?.http_code || error?.error?.http_code,
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, artworks.length) }, fingerprintWorker));
    const nextOffset = offset + artworks.length;
    const complete = nextOffset >= total;
    let groups = [];
    if (complete) {
      const refreshed = await Artwork.find({ $or: [{ contentHash: { $exists: true, $ne: "" } }, { perceptualHash: { $ne: "" } }] })
        .select("_id title images contentHash perceptualHash originalFilename createdAt")
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      groups = buildDuplicateGroups(refreshed).map((group) => ({
        keep: group.keep,
        duplicates: group.duplicates,
        reason: duplicateReason(group.keep, group.duplicates[0]),
      }));
    }
    res.json({
      success: true,
      scanned: nextOffset,
      total,
      nextOffset,
      complete,
      fingerprinted,
      unavailable,
      duplicateGroups: groups,
      duplicateCount: groups.reduce((count, group) => count + group.duplicates.length, 0),
    });
  } catch (error) {
    console.error("Duplicate scan failed:", error);
    res.status(500).json({ success: false, message: "Duplicate scan could not be completed" });
  }
});

router.post("/duplicates/remove", protect, adminOnly, async (req, res) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ success: false, message: "Explicit confirmation is required" });
    const artworks = await Artwork.find({ $or: [{ contentHash: { $exists: true, $ne: "" } }, { perceptualHash: { $ne: "" } }] })
      .select("_id title images contentHash perceptualHash createdAt")
      .sort({ createdAt: 1, _id: 1 });
    const groups = buildDuplicateGroups(artworks);
    const confirmedDuplicates = groups.flatMap((group) => group.duplicates);
    const requestedIds = Array.isArray(req.body?.ids)
      ? [...new Set(req.body.ids.map((id) => optionalText(id)).filter(Boolean))]
      : [];
    if (requestedIds.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: "One or more selected duplicate IDs are invalid" });
    }
    const confirmedIds = new Set(confirmedDuplicates.map((artwork) => String(artwork._id)));
    if (requestedIds.some((id) => !confirmedIds.has(id))) {
      return res.status(409).json({ success: false, message: "Selection contains an artwork that is not a confirmed duplicate. Scan again." });
    }
    const duplicates = requestedIds.length
      ? confirmedDuplicates.filter((artwork) => requestedIds.includes(String(artwork._id)))
      : confirmedDuplicates;
    if (!duplicates.length) return res.json({ success: true, removed: 0, message: "No duplicates were found" });
    const ids = duplicates.map((artwork) => artwork._id);
    const publicIds = imagePublicIdsFor(duplicates);
    await deleteArtworkDocumentsByIds(ids);
    const publicSync = await safeSyncPublicData("automatic-duplicate-removal");
    if (!publicSync.success) {
      return res.status(502).json({ success: false, removed: ids.length, message: publicSync.message, cloudinaryCleanup: { skipped: true } });
    }
    const cloudinaryCleanup = await deleteCloudinaryImages(publicIds);
    res.status(cloudinaryCleanup.failures.length ? 207 : 200).json({
      success: cloudinaryCleanup.failures.length === 0,
      removed: ids.length,
      kept: groups.length,
      cloudinaryCleanup,
      message: `${ids.length} duplicate artwork${ids.length === 1 ? "" : "s"} removed; the oldest copy in each group was kept.`,
    });
  } catch (error) {
    console.error("Duplicate removal failed:", error);
    res.status(error?.status || 500).json({ success: false, message: error?.publicMessage || "Duplicates could not be removed" });
  }
});

// @route   DELETE /api/artworks/bulk
// @desc    Delete multiple artworks and all associated Cloudinary images
// @access  Private/Admin
router.delete("/bulk", protect, adminOnly, async (req, res) => {
  try {
    const validation = validateBulkDeleteIds(req.body);
    const ids = validation.valid ? validation.ids : req.body?.ids;
    console.log("BULK DELETE START");
    console.log("Received IDs:", ids);
    console.log("Number of IDs:", ids?.length);
    console.log("Bulk delete request received");
    console.log("IDs:", ids);
    console.log("Number of IDs:", ids?.length);
    console.log("[artworks:bulk-delete] request received", {
      hasBody: Boolean(req.body),
      idsType: Array.isArray(req.body?.ids) ? "array" : typeof req.body?.ids,
      receivedCount: Array.isArray(req.body?.ids) ? req.body.ids.length : 0,
      valid: validation.valid,
    });
    if (!validation.valid) {
      console.warn("[artworks:bulk-delete] validation failed", {
        message: validation.message,
        invalidCount: validation.invalidIds?.length || 0,
      });
      return res.status(validation.status).json({
        success: false,
        message: validation.message,
        ...(validation.invalidIds ? { invalidIds: validation.invalidIds } : {}),
      });
    }

    console.log("[artworks:bulk-delete] finding artworks", { requestedCount: ids.length });
    const artworks = await Artwork.find({ _id: { $in: ids } });
    console.log("Found artworks:", artworks.length);
    logBulkArtworkDeletionPlan(artworks);
    if (artworks.length !== ids.length) {
      const foundIds = new Set(artworks.map((artwork) => artwork._id.toString()));
      console.warn("[artworks:bulk-delete] selected artworks missing", {
        requestedCount: ids.length,
        foundCount: artworks.length,
        missingCount: ids.length - artworks.length,
      });
      return res.status(404).json({
        success: false,
        message: "One or more selected artworks were not found",
        missingIds: ids.filter((id) => !foundIds.has(id)),
      });
    }

    const publicIds = imagePublicIdsFor(artworks);
    const deleteResult = await deleteArtworkDocumentsByIds(ids);
    console.log("[artworks:bulk-delete] MongoDB delete complete", {
      requestedCount: ids.length,
      deletedCount: deleteResult.deletedCount,
      acknowledged: deleteResult.acknowledged,
    });
    if (deleteResult.deletedCount !== ids.length) {
      return res.status(500).json({
        success: false,
        message: "Not every artwork record could be deleted. Cloudinary images were kept.",
        deletedCount: deleteResult.deletedCount,
        requestedCount: ids.length,
      });
    }

    const publicSync = await safeSyncPublicData("artwork-bulk-deleted");
    if (!publicSync.success) {
      return res.status(207).json({
        success: false,
        partial: true,
        message: publicSync.message,
        deletedCount: ids.length,
        publicSync,
        cloudinaryCleanup: { skipped: true, reason: "Public data was not synchronized" },
      });
    }
    const cloudinaryCleanup = await deleteCloudinaryImages(publicIds);
    const cleanupFailed = cloudinaryCleanup.failures.length > 0;
    res.status(cleanupFailed ? 207 : 200).json({
      success: !cleanupFailed,
      partial: cleanupFailed,
      message: cleanupFailed
        ? `${ids.length} artworks were removed from the Gallery, but some image cleanup failed.`
        : `${ids.length} artworks deleted successfully`,
      deletedCount: ids.length,
      publicSync,
      cloudinaryCleanup,
    });
  } catch (error) {
    console.error("Bulk artwork deletion failed:", error);
    console.error("[artworks:bulk-delete] unexpected error", {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });
    res.status(error?.status || 500).json({
      success: false,
      message: error?.status === 409 ? error.message : "Server error",
      ...(error?.deletedCount !== undefined ? { deletedCount: error.deletedCount } : {}),
      ...(error?.requestedCount !== undefined ? { requestedCount: error.requestedCount } : {}),
    });
  }
});

// Cancellable Upload History deletion jobs. Each job globally shares five
// deletion slots, and a cancelled job never claims another queued artwork.
router.post("/deletion-jobs", protect, adminOnly, async (req, res) => {
  const validation = validateBulkDeleteIds(req.body);
  if (!validation.valid) {
    return res.status(validation.status).json({ success: false, message: validation.message });
  }
  try {
    const deleteBatchHistory = req.body?.deleteBatchHistory === true;
    const batchByArtworkId = new Map();
    if (deleteBatchHistory) {
      const selectedArtworks = await Artwork.find({ _id: { $in: validation.ids } }).select("_id uploadBatchId").lean();
      selectedArtworks.forEach((artwork) => {
        if (artwork.uploadBatchId) batchByArtworkId.set(String(artwork._id), artwork.uploadBatchId);
      });
    }
    const job = createArtworkDeletionJob({
      ids: validation.ids,
      requestedBy: req.user._id,
      deleteArtwork: deleteArtworkForJob,
      sync: () => safeSyncPublicData("artwork-deletion-job-finalized"),
      cleanup: cleanupDeletedArtworkImages,
      finalize: deleteBatchHistory
        ? async (result) => {
            const completedIds = result.items
              .filter((item) => item.status === "deleted" || item.status === "missing")
              .map((item) => batchByArtworkId.get(item.id))
              .filter(Boolean);
            return deleteUploadBatchHistory(completedIds);
          }
        : null,
    });
    setImmediate(() => {
      startArtworkDeletionJob(job.id)?.catch((error) => {
        console.error("Artwork deletion job failed:", error?.message || "unknown error");
      });
    });
    return res.status(202).json({ success: true, job });
  } catch (error) {
    console.error("Artwork deletion job initialization failed:", error);
    return res.status(500).json({ success: false, message: "Deletion job could not be started" });
  }
});

router.get("/deletion-jobs/:jobId", protect, adminOnly, (req, res) => {
  const job = getArtworkDeletionJob(req.params.jobId, req.user._id);
  if (!job) return res.status(404).json({ success: false, message: "Deletion job not found" });
  return res.json({ success: true, job });
});

router.post("/deletion-jobs/:jobId/cancel", protect, adminOnly, (req, res) => {
  const job = cancelArtworkDeletionJob(req.params.jobId, req.user._id);
  if (!job) return res.status(404).json({ success: false, message: "Deletion job not found" });
  return res.json({ success: true, job });
});

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
    const query = { uploadHistoryVisible: { $ne: false } };
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
      { $match: { uploadBatchId: { $exists: true, $ne: "" }, uploadHistoryVisible: { $ne: false } } },
      { $group: { _id: "$uploadBatchId", uploadedAt: { $max: "$createdAt" }, total: { $sum: 1 }, successful: { $sum: { $cond: [{ $eq: ["$uploadStatus", "success"] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ["$uploadStatus", "failed"] }, 1, 0] } }, uploadedBy: { $first: "$uploadedBy" } } },
      { $sort: { uploadedAt: -1 } },
    ]), UploadBatch.find({ historyVisible: { $ne: false } }).sort({ createdAt: -1 }).lean()]);
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
        remainingArtworkCount: batch.total,
        canDeleteHistory: batch.total === 0,
      };
    });
    for (const saved of summaries.values()) batches.push({
      uploadBatchId: saved.uploadBatchId,
      uploadedAt: saved.createdAt,
      total: saved.selectedCount,
      successful: saved.successfulCount,
      failed: saved.failedCount,
      uploadedBy: saved.uploadedBy,
      remainingArtworkCount: 0,
      canDeleteHistory: true,
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

router.delete("/upload-history/batches/:uploadBatchId", protect, adminOnly, async (req, res) => {
  try {
    const uploadBatchId = optionalText(req.params.uploadBatchId);
    if (!uploadBatchId || uploadBatchId.length > 160) {
      return res.status(400).json({ success: false, message: "Invalid upload batch ID" });
    }
    const result = await deleteUploadBatchHistory([uploadBatchId]);
    if (result.blockedBatchIds.length) {
      return res.status(409).json({
        success: false,
        message: `Batch history cannot be deleted while ${result.remainingArtworkCount} artwork${result.remainingArtworkCount === 1 ? "" : "s"} from this batch remain on the website.`,
        ...result,
      });
    }
    return res.json({
      success: true,
      message: "Batch history deleted because no artworks from this batch remain.",
      ...result,
    });
  } catch (error) {
    console.error("Upload batch history deletion error:", error);
    return res.status(500).json({ success: false, message: "Batch history could not be deleted" });
  }
});

// @route   GET /api/artworks/:id
// @desc    Get single artwork by ID
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid artwork ID" });
    }
    const artwork = await Artwork.findOne({
      _id: req.params.id,
      publicationStatus: { $nin: ["draft", "unpublished", "archived"] },
    }).lean({ versionKey: false });
    if (!artwork) {
      return res.status(404).json({ success: false, message: "Artwork not found" });
    }
    res.json({ success: true, artwork: sanitizePublicArtwork(artwork) });
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
    const { title, description, category, price, medium, dimensions, collection, series, catalogueNumber, provenance, exhibitionHistory, publications, creationLocation, tags, keywords, publicationStatus, allowLongDescription, isAvailable, isFeatured, year, clientUploadId, uploadBatchId } = req.body;

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

    const draftArtwork = {
      title: optionalText(title) || titleFromFilename(req.files[0]?.originalname),
      description: optionalText(description),
      category: optionalText(category) || "Uncategorized",
      price: normalizedPrice,
      medium: optionalText(medium),
      dimensions: optionalText(dimensions),
      collection: optionalText(collection),
      series: optionalText(series),
      catalogueNumber: optionalText(catalogueNumber),
      provenance: optionalText(provenance),
      exhibitionHistory: optionalText(exhibitionHistory),
      publications: optionalText(publications),
      creationLocation: optionalText(creationLocation),
      tags: cleanTextList(tags),
      keywords: cleanTextList(keywords),
      publicationStatus: ["draft", "published", "unpublished", "archived"].includes(publicationStatus) ? publicationStatus : "published",
      allowLongDescription,
      isAvailable: isAvailable === "false" ? false : true,
      isFeatured: isFeatured === "true",
      year: normalizedYear,
      images,
      clientUploadId: optionalText(clientUploadId) || undefined,
      uploadBatchId: optionalText(uploadBatchId) || undefined,
      uploadStatus: "success",
      uploadedBy: uploadedByValue(req.user),
    };
    if (draftArtwork.publicationStatus === "published") {
      const publishingErrors = validatePublishableArtwork(draftArtwork);
      if (publishingErrors.length) {
        await discardUploadedImages(images);
        return res.status(400).json({ success: false, message: publishingErrors[0], errors: publishingErrors });
      }
    }
    const artwork = await Artwork.create(draftArtwork);

    const publicSync = await safeSyncPublicData("artwork-created");
    res.status(201).json({ success: true, message: "Artwork created", artwork, publicSync });
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
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { title, description, category, price, medium, dimensions, collection, series, catalogueNumber, provenance, exhibitionHistory, publications, creationLocation, tags, keywords, publicationStatus, allowLongDescription, isAvailable, isFeatured, year } = req.body;

    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ success: false, message: "Artwork not found" });
    }
    const wasPublished = !artwork.publicationStatus || artwork.publicationStatus === "published";

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
    for (const field of ["collection", "series", "catalogueNumber", "provenance", "exhibitionHistory", "publications", "creationLocation"]) {
      if (req.body[field] !== undefined) artwork[field] = optionalText(req.body[field]);
    }
    if (tags !== undefined) artwork.tags = cleanTextList(tags);
    if (keywords !== undefined) artwork.keywords = cleanTextList(keywords);
    if (publicationStatus !== undefined) {
      if (!["draft", "published", "unpublished", "archived"].includes(publicationStatus)) {
        return res.status(400).json({ success: false, message: "Invalid publication status" });
      }
      artwork.publicationStatus = publicationStatus;
    }
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

    if (publicationStatus === "published" && !wasPublished) {
      const publishingErrors = validatePublishableArtwork({ ...artwork.toObject(), allowLongDescription });
      if (publishingErrors.length) return res.status(400).json({ success: false, message: publishingErrors[0], errors: publishingErrors });
    }
    await artwork.save();
    const publicSync = await safeSyncPublicData("artwork-updated");
    res.json({ success: true, message: "Artwork updated", artwork, publicSync });
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

    const publicSync = await safeSyncPublicData("artwork-images-added");
    res.json({ success: true, message: "Images added", artwork, publicSync });
  } catch (error) {
    console.error("Add images error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   DELETE /api/artworks/:id/images/:publicId
// @desc    Remove a specific image from artwork
// @access  Private
router.delete("/:id/images/:publicId", protect, adminOnly, async (req, res) => {
  try {
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ success: false, message: "Artwork not found" });
    }

    // URL-decode the publicId (Cloudinary IDs may contain slashes)
    const publicId = decodeURIComponent(req.params.publicId);

    // Remove the image from public data before permanently deleting its asset.
    artwork.images = artwork.images.filter((img) => img.publicId !== publicId);
    await artwork.save();
    const publicSync = await safeSyncPublicData("artwork-image-removed");
    if (!publicSync.success) {
      return res.status(207).json({
        success: false,
        partial: true,
        message: publicSync.message,
        artwork,
        publicSync,
        cloudinaryCleanup: { skipped: true },
      });
    }
    const cloudinaryCleanup = await deleteCloudinaryImages([publicId]);
    res.status(cloudinaryCleanup.failures.length ? 207 : 200).json({
      success: cloudinaryCleanup.failures.length === 0,
      partial: cloudinaryCleanup.failures.length > 0,
      message: cloudinaryCleanup.failures.length ? "Image was removed from the Gallery, but Cloudinary cleanup failed" : "Image removed",
      artwork,
      publicSync,
      cloudinaryCleanup,
    });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   DELETE /api/artworks/:id
// @desc    Delete artwork and all its Cloudinary images
// @access  Private
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid artwork ID" });
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ success: false, message: "Artwork not found" });
    }

    const publicIds = imagePublicIdsFor([artwork]);
    await artwork.deleteOne();
    const publicSync = await safeSyncPublicData("artwork-deleted");
    if (!publicSync.success) {
      return res.status(207).json({
        success: false,
        partial: true,
        message: publicSync.message,
        publicSync,
        cloudinaryCleanup: { skipped: true },
      });
    }
    const cloudinaryCleanup = await deleteCloudinaryImages(publicIds);
    res.status(cloudinaryCleanup.failures.length ? 207 : 200).json({
      success: cloudinaryCleanup.failures.length === 0,
      partial: cloudinaryCleanup.failures.length > 0,
      message: cloudinaryCleanup.failures.length
        ? "Artwork was removed from the Gallery, but some Cloudinary images could not be deleted"
        : "Artwork deleted",
      publicSync,
      cloudinaryCleanup,
    });
  } catch (error) {
    console.error("Delete artwork error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Keep upload validation failures actionable instead of returning the generic server error.
router.use((error, req, res, next) => {
  if (error?.name === "MulterError") {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Artwork image is too large to upload"
      : error.message || "Invalid artwork image upload";
    return res.status(400).json({ success: false, message });
  }
  return next(error);
});

router.__testables = {
  titleFromFilename,
  imagePublicIdsFor,
  validateBulkDeleteIds,
  logBulkArtworkDeletionPlan,
};

module.exports = router;
