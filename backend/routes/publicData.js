const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { buildPublicSnapshot } = require("../utils/publicSnapshot");
const { flushStaticRebuild } = require("../utils/staticRebuild");
const { syncPublicData } = require("../utils/publicDataSync");

router.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  next();
});

router.get("/", async (req, res) => {
  try {
    const snapshot = await buildPublicSnapshot();
    res.json(snapshot);
  } catch (error) {
    console.error("Public data export error:", error);
    res.status(500).json({ success: false, message: "Failed to export public data" });
  }
});

router.post("/sync", protect, async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    const publicSync = await syncPublicData(req.body?.reason || "manual-public-data-sync");
    if (!publicSync.success) return res.status(502).json({
      success: false,
      code: "PUBLIC_DATA_SYNC_FAILED",
      message: publicSync.message,
      // This is operational information only (configuration, timeout, or
      // upstream HTTP status); the export key and upstream response body stay server-side.
      detail: publicSync.detail,
      attempts: publicSync.attempts,
    });
    res.json({
      success: true,
      message: publicSync.localOnly ? "Local Gallery data is current" : "Public Gallery synchronized",
      publicSync,
    });
  } catch (error) {
    console.error("Manual public data sync error:", { name: error?.name, message: error?.message });
    res.status(500).json({ success: false, message: "Failed to synchronize public data" });
  }
});

router.post("/rebuild-seo", protect, async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    if (req.body?.confirmation !== "REGENERATE_SEO") {
      return res.status(400).json({ success: false, message: "SEO regeneration confirmation is required" });
    }
    const result = await flushStaticRebuild(req.body?.reason || "explicit-seo-regeneration");
    if (!result.triggered) return res.status(400).json({ success: false, message: result.message || "Netlify build hook is not configured" });
    res.json({ success: true, message: "SEO regeneration build triggered" });
  } catch (error) {
    console.error("Manual SEO rebuild error:", error);
    res.status(500).json({ success: false, message: "Failed to trigger SEO regeneration" });
  }
});

module.exports = router;
