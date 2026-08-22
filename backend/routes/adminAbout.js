const express = require("express");
const { protect } = require("../middleware/auth");
const { uploadAboutMedia, getCloudinaryFileInfo } = require("../config/cloudinary");
const { getOrCreateAboutPage } = require("../utils/aboutPage");
const { syncPublicData } = require("../utils/publicDataSync");

const router = express.Router();
const repeatableSections = new Set(["practices", "timeline", "publicWorks", "awards", "pressArchive", "process"]);
const updatedBy = (user) => user?._id?.toString() || user?.email || "";

const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ success: false, message: "Admin access required" });
  next();
};

router.use(protect, adminOnly);

router.get("/", async (req, res) => {
  try {
    const aboutPage = await getOrCreateAboutPage();
    res.json({ success: true, aboutPage });
  } catch (error) {
    console.error("Admin About page error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/", async (req, res) => {
  try {
    const content = req.body?.content || req.body?.draft;
    if (!content || typeof content !== "object") {
      return res.status(400).json({ success: false, message: "About page content is required" });
    }
    const aboutPage = await getOrCreateAboutPage();
    aboutPage.draft = content;
    aboutPage.updatedBy = updatedBy(req.user);
    await aboutPage.save();
    res.json({ success: true, message: "About page draft saved", aboutPage });
  } catch (error) {
    console.error("Save About page error:", error);
    res.status(error?.name === "ValidationError" ? 400 : 500).json({ success: false, message: error.message || "Server error" });
  }
});

router.post("/media", uploadAboutMedia.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Select an image to upload" });
    const image = getCloudinaryFileInfo(req.file);
    if (!image.url || !image.publicId) return res.status(500).json({ success: false, message: "Image upload failed" });
    res.status(201).json({ success: true, message: "About page image uploaded", image });
  } catch (error) {
    console.error("About page media upload error:", error);
    res.status(500).json({ success: false, message: "Image upload failed" });
  }
});

router.patch("/publish", async (req, res) => {
  try {
    const aboutPage = await getOrCreateAboutPage();
    const isPublished = req.body?.isPublished !== false;
    if (isPublished) {
      aboutPage.published = aboutPage.draft.toObject({ depopulate: true });
      aboutPage.publishedAt = new Date();
    }
    aboutPage.isPublished = isPublished;
    aboutPage.updatedBy = updatedBy(req.user);
    await aboutPage.save();
    const publicSync = await syncPublicData(isPublished ? "about-page-published" : "about-page-unpublished");
    res.json({ success: true, message: isPublished ? "About page published" : "About page unpublished", aboutPage, publicSync });
  } catch (error) {
    console.error("Publish About page error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/:section", async (req, res) => {
  try {
    if (!repeatableSections.has(req.params.section)) return res.status(404).json({ success: false, message: "Unknown About page section" });
    const aboutPage = await getOrCreateAboutPage();
    const items = aboutPage.draft[req.params.section];
    items.push({ ...req.body, _id: undefined, order: Number.isFinite(Number(req.body.order)) ? Number(req.body.order) : items.length });
    aboutPage.updatedBy = updatedBy(req.user);
    await aboutPage.save();
    res.status(201).json({ success: true, message: "Entry added", item: items[items.length - 1], aboutPage });
  } catch (error) {
    res.status(error?.name === "ValidationError" ? 400 : 500).json({ success: false, message: error.message || "Server error" });
  }
});

router.put("/:section/:itemId", async (req, res) => {
  try {
    if (!repeatableSections.has(req.params.section)) return res.status(404).json({ success: false, message: "Unknown About page section" });
    const aboutPage = await getOrCreateAboutPage();
    const item = aboutPage.draft[req.params.section].id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: "Entry not found" });
    const changes = { ...req.body };
    delete changes._id;
    item.set(changes);
    aboutPage.updatedBy = updatedBy(req.user);
    await aboutPage.save();
    res.json({ success: true, message: "Entry updated", item, aboutPage });
  } catch (error) {
    res.status(error?.name === "ValidationError" ? 400 : 500).json({ success: false, message: error.message || "Server error" });
  }
});

router.delete("/:section/:itemId", async (req, res) => {
  try {
    if (!repeatableSections.has(req.params.section)) return res.status(404).json({ success: false, message: "Unknown About page section" });
    const aboutPage = await getOrCreateAboutPage();
    const item = aboutPage.draft[req.params.section].id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: "Entry not found" });
    item.deleteOne();
    aboutPage.updatedBy = updatedBy(req.user);
    await aboutPage.save();
    res.json({ success: true, message: "Entry deleted", aboutPage });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/:section/reorder", async (req, res) => {
  try {
    if (!repeatableSections.has(req.params.section)) return res.status(404).json({ success: false, message: "Unknown About page section" });
    if (!Array.isArray(req.body?.itemIds)) return res.status(400).json({ success: false, message: "itemIds array is required" });
    const aboutPage = await getOrCreateAboutPage();
    const order = new Map(req.body.itemIds.map((id, index) => [String(id), index]));
    aboutPage.draft[req.params.section].forEach((item, index) => {
      item.order = order.has(String(item._id)) ? order.get(String(item._id)) : req.body.itemIds.length + index;
    });
    aboutPage.draft[req.params.section].sort((first, second) => first.order - second.order);
    aboutPage.updatedBy = updatedBy(req.user);
    await aboutPage.save();
    res.json({ success: true, message: "Entries reordered", aboutPage });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.use((error, req, res, next) => {
  if (error?.name === "MulterError") return res.status(400).json({ success: false, message: error.code === "LIMIT_FILE_SIZE" ? "About page images must be 20 MB or smaller" : error.message });
  next(error);
});

module.exports = router;
