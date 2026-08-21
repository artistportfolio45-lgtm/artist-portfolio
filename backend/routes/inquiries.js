// Public inquiry intake plus authenticated admin inbox and Trash management.

const express = require("express");
const mongoose = require("mongoose");
const Inquiry = require("../models/Inquiry");
const Artwork = require("../models/Artwork");
const { protect } = require("../middleware/auth");
const { logActivity } = require("../middleware/activityLogger");
const {
  buildInquiryFilter,
  chunkInquiryIds,
  normalizeInquiryIds,
  trimText,
  validateInquiryFilters,
} = require("../utils/inquiryManagement");

const router = express.Router();
const adminOnly = (req, res, next) => req.user?.role === "admin"
  ? next()
  : res.status(403).json({ success: false, message: "Admin access required" });
const validInquiryId = (value) => mongoose.isValidObjectId(value);
const activeInquiry = { deletedAt: null };

const inquiryCounts = async () => {
  const [total, unread, resolved, unresolved, trash] = await Promise.all([
    Inquiry.countDocuments(activeInquiry),
    Inquiry.countDocuments({ ...activeInquiry, isRead: false }),
    Inquiry.countDocuments({ ...activeInquiry, isResolved: true }),
    Inquiry.countDocuments({ ...activeInquiry, isResolved: { $ne: true } }),
    Inquiry.countDocuments({ deletedAt: { $ne: null } }),
  ]);
  return { total, unread, resolved, unresolved, trash };
};

const activityForAction = {
  trash: "Inquiry moved to Trash",
  restore: "Inquiry restored",
  permanent: "Inquiry permanently deleted",
};

const performIdAction = async (rawIds, action, req, { log = true } = {}) => {
  const normalized = normalizeInquiryIds(rawIds);
  if (normalized.error) return { error: normalized.error, status: 400 };

  const result = { requested: normalized.ids.length, affected: 0, deleted: 0, alreadyMissing: 0, unchanged: 0, failed: 0 };
  for (const ids of chunkInquiryIds(normalized.ids)) {
    try {
      const existing = await Inquiry.find({ _id: { $in: ids } }).select("_id deletedAt").lean();
      result.alreadyMissing += ids.length - existing.length;
      const eligible = existing.filter((inquiry) => action === "trash" ? !inquiry.deletedAt : Boolean(inquiry.deletedAt));
      result.unchanged += existing.length - eligible.length;
      const eligibleIds = eligible.map((inquiry) => inquiry._id);
      if (!eligibleIds.length) continue;

      if (action === "trash") {
        const operation = await Inquiry.updateMany(
          { _id: { $in: eligibleIds }, deletedAt: null },
          { $set: { deletedAt: new Date(), deletedBy: req.user._id } }
        );
        result.affected += operation.modifiedCount || 0;
      } else if (action === "restore") {
        const operation = await Inquiry.updateMany(
          { _id: { $in: eligibleIds }, deletedAt: { $ne: null } },
          { $set: { deletedAt: null, deletedBy: null } }
        );
        result.affected += operation.modifiedCount || 0;
      } else {
        const operation = await Inquiry.deleteMany({ _id: { $in: eligibleIds }, deletedAt: { $ne: null } });
        result.deleted += operation.deletedCount || 0;
      }
    } catch {
      result.failed += ids.length;
    }
  }

  const changed = action === "permanent" ? result.deleted : result.affected;
  if (log) await logActivity(req, {
    action: normalized.ids.length === 1 ? activityForAction[action] : `Bulk ${activityForAction[action].toLowerCase()}`,
    module: "inquiries",
    metadata: {
      status: result.failed ? (changed ? "partial" : "failed") : "success",
      ...(normalized.ids.length === 1 ? { inquiryId: normalized.ids[0] } : { requested: result.requested }),
      affected: changed,
      alreadyMissing: result.alreadyMissing,
      failed: result.failed,
    },
  });
  return { result };
};

const queryForValidatedFilters = (filters, action, rawExcludedIds = []) => {
  const validationError = validateInquiryFilters(filters);
  if (validationError) return { error: validationError, status: 400 };
  const query = buildInquiryFilter(filters, { trash: action !== "trash" });
  if (Array.isArray(rawExcludedIds) && rawExcludedIds.length) {
    const excluded = normalizeInquiryIds(rawExcludedIds);
    if (excluded.error) return { error: excluded.error, status: 400 };
    query._id = { $nin: excluded.ids };
  } else if (rawExcludedIds !== undefined && !Array.isArray(rawExcludedIds)) {
    return { error: "Excluded inquiry IDs must be an array", status: 400 };
  }
  return { query };
};

const performFilteredAction = async (filters, excludedIds, action, req, { log = true } = {}) => {
  const source = queryForValidatedFilters(filters, action, excludedIds);
  if (source.error) return source;
  const result = { requested: await Inquiry.countDocuments(source.query), affected: 0, deleted: 0, alreadyMissing: 0, unchanged: 0, failed: 0 };
  let lastId = null;
  while (true) {
    const query = { ...source.query };
    query._id = { ...(source.query._id || {}), ...(lastId ? { $gt: lastId } : {}) };
    const batch = await Inquiry.find(query).sort({ _id: 1 }).limit(200).select("_id").lean();
    if (!batch.length) break;
    lastId = batch[batch.length - 1]._id;
    const outcome = await performIdAction(batch.map((inquiry) => String(inquiry._id)), action, req, { log: false });
    for (const field of ["affected", "deleted", "alreadyMissing", "unchanged", "failed"]) result[field] += outcome.result[field];
  }
  const changed = action === "permanent" ? result.deleted : result.affected;
  if (log) await logActivity(req, {
    action: `Bulk ${activityForAction[action].toLowerCase()}`,
    module: "inquiries",
    metadata: { status: result.failed ? (changed ? "partial" : "failed") : "success", requested: result.requested, affected: changed, alreadyMissing: result.alreadyMissing, failed: result.failed },
  });
  return { result };
};

const runBulkAction = async (req, res, action, { filtered = false } = {}) => {
  if (action === "permanent" && req.body?.confirm !== true) {
    await logActivity(req, { action: activityForAction[action], module: "inquiries", metadata: { status: "failed", reason: "confirmation-required" } });
    return res.status(400).json({ success: false, message: "Permanent deletion confirmation is required" });
  }
  const outcome = filtered
    ? await performFilteredAction(req.body?.filters || {}, req.body?.excludedIds || [], action, req)
    : await performIdAction(req.body?.ids, action, req);
  if (outcome.error) {
    await logActivity(req, { action: filtered ? `Bulk ${activityForAction[action].toLowerCase()}` : activityForAction[action], module: "inquiries", metadata: { status: "failed", reason: "validation" } });
    return res.status(outcome.status).json({ success: false, message: outcome.error });
  }
  const changed = action === "permanent" ? outcome.result.deleted : outcome.result.affected;
  return res.json({
    success: outcome.result.failed === 0,
    partial: outcome.result.failed > 0 && changed > 0,
    message: outcome.result.failed ? "Some inquiries could not be processed" : `${changed} ${changed === 1 ? "inquiry" : "inquiries"} processed`,
    result: outcome.result,
    counts: await inquiryCounts(),
  });
};

// Public Contact and Artwork Enquiry intake.
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, subject, message, inquiryType, artwork, artworkId, artworkInterested, artworkTitle: submittedArtworkTitle, artworkUrl, sourcePage } = req.body;
    if ([name, email, message].some((value) => typeof value !== "string") || !name.trim() || !email.trim() || !message.trim()) {
      return res.status(400).json({ success: false, message: "Name, email, and message are required" });
    }
    if (name.length > 120 || email.length > 254 || String(phone || "").length > 40 || String(subject || "").length > 200 || message.length > 5000 || String(sourcePage || "").length > 500) {
      return res.status(400).json({ success: false, message: "Inquiry content is too long" });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: "Invalid email address" });

    let artworkTitle = "";
    let artworkRef = null;
    const requestedArtworkId = artwork || artworkId || artworkInterested;
    if (requestedArtworkId) {
      if (!mongoose.isValidObjectId(requestedArtworkId)) return res.status(400).json({ success: false, message: "Invalid artwork selected" });
      const artworkDoc = await Artwork.findById(requestedArtworkId).select("title");
      if (artworkDoc) { artworkTitle = artworkDoc.title; artworkRef = artworkDoc._id; }
    }

    await Inquiry.create({
      name: name.trim(), email: email.toLowerCase().trim(), phone: trimText(phone),
      subject: trimText(subject) || "General Enquiry", message: message.trim(),
      inquiryType: inquiryType === "artwork" || artworkRef ? "artwork" : "contact",
      artwork: artworkRef, artworkInterested: artworkRef,
      artworkTitle: artworkTitle || trimText(submittedArtworkTitle),
      artworkUrl: trimText(artworkUrl), sourcePage: trimText(sourcePage),
    });
    res.status(201).json({ success: true, message: "Inquiry submitted successfully" });
  } catch (error) {
    console.error("Submit inquiry failed:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Fixed admin routes stay before /:id.
router.post("/bulk/trash", protect, adminOnly, async (req, res) => {
  try { return await runBulkAction(req, res, "trash"); } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});
router.post("/filtered/trash", protect, adminOnly, async (req, res) => {
  try { return await runBulkAction(req, res, "trash", { filtered: true }); } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});
router.post("/bulk/restore", protect, adminOnly, async (req, res) => {
  try { return await runBulkAction(req, res, "restore"); } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});
router.post("/filtered/restore", protect, adminOnly, async (req, res) => {
  try { return await runBulkAction(req, res, "restore", { filtered: true }); } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});
router.delete("/bulk/permanent", protect, adminOnly, async (req, res) => {
  try { return await runBulkAction(req, res, "permanent"); } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});
router.delete("/filtered/permanent", protect, adminOnly, async (req, res) => {
  try { return await runBulkAction(req, res, "permanent", { filtered: true }); } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});
router.delete("/trash/empty", protect, adminOnly, async (req, res) => {
  try {
    if (req.body?.confirmation !== "DELETE") {
      await logActivity(req, { action: "Inquiry Trash emptied", module: "inquiries", metadata: { status: "failed", reason: "confirmation-required" } });
      return res.status(400).json({ success: false, message: "Type DELETE to empty Trash" });
    }
    const outcome = await performFilteredAction({}, [], "permanent", req, { log: false });
    if (!outcome.result.requested) return res.json({ success: true, message: "Trash is already empty", result: outcome.result, counts: await inquiryCounts() });
    await logActivity(req, {
      action: "Inquiry Trash emptied", module: "inquiries",
      metadata: { status: outcome.result.failed ? "partial" : "success", requested: outcome.result.requested, deleted: outcome.result.deleted, failed: outcome.result.failed },
    });
    return res.json({ success: outcome.result.failed === 0, partial: outcome.result.failed > 0 && outcome.result.deleted > 0, message: `${outcome.result.deleted} inquiries permanently deleted`, result: outcome.result, counts: await inquiryCounts() });
  } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});

router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const query = buildInquiryFilter(req.query, { trash: req.query.view === "trash" });
    const currentPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const skip = (currentPage - 1) * pageSize;
    const [inquiries, filteredTotal, counts] = await Promise.all([
      Inquiry.find(query).populate("artworkInterested", "title images").sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize),
      Inquiry.countDocuments(query), inquiryCounts(),
    ]);
    res.json({ success: true, inquiries, counts, unreadCount: counts.unread, pagination: { total: filteredTotal, page: currentPage, limit: pageSize, pages: Math.ceil(filteredTotal / pageSize) } });
  } catch { res.status(500).json({ success: false, message: "Server error" }); }
});

router.get("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    const inquiry = await Inquiry.findById(req.params.id).populate("artworkInterested", "title images");
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    res.json({ success: true, inquiry });
  } catch { res.status(500).json({ success: false, message: "Server error" }); }
});

router.patch("/:id/read", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    const inquiry = await Inquiry.findOne({ _id: req.params.id, ...activeInquiry });
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    inquiry.isRead = !inquiry.isRead; await inquiry.save();
    res.json({ success: true, message: `Marked as ${inquiry.isRead ? "read" : "unread"}`, inquiry, counts: await inquiryCounts() });
  } catch { res.status(500).json({ success: false, message: "Server error" }); }
});

router.patch("/:id/resolved", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    const inquiry = await Inquiry.findOne({ _id: req.params.id, ...activeInquiry });
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    inquiry.isResolved = !inquiry.isResolved; await inquiry.save();
    res.json({ success: true, message: inquiry.isResolved ? "Inquiry resolved" : "Inquiry reopened", inquiry, counts: await inquiryCounts() });
  } catch { res.status(500).json({ success: false, message: "Server error" }); }
});

router.patch("/:id/trash", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    req.body = { ids: [req.params.id] }; return await runBulkAction(req, res, "trash");
  } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});
router.patch("/:id/restore", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    req.body = { ids: [req.params.id] }; return await runBulkAction(req, res, "restore");
  } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});
router.delete("/:id/permanent", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    req.body = { ids: [req.params.id], confirm: req.body?.confirm === true }; return await runBulkAction(req, res, "permanent");
  } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});

// Backward-compatible delete now uses recoverable Trash semantics.
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (!validInquiryId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid inquiry ID" });
    req.body = { ids: [req.params.id] }; return await runBulkAction(req, res, "trash");
  } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});

module.exports = router;
