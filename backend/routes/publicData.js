const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { buildPublicSnapshot } = require("../utils/publicSnapshot");
const { flushStaticRebuild } = require("../utils/staticRebuild");

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
    const exportKey = process.env.PUBLIC_DATA_EXPORT_KEY;
    if (exportKey && req.get("x-static-export-key") !== exportKey) {
      return res.status(401).json({ success: false, message: "Invalid export key" });
    }

    const snapshot = await buildPublicSnapshot();
    res.json(snapshot);
  } catch (error) {
    console.error("Public data export error:", error);
    res.status(500).json({ success: false, message: "Failed to export public data" });
  }
});

router.post("/rebuild", protect, async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    const result = await flushStaticRebuild(req.body?.reason || "manual-public-data-rebuild");
    if (!result.triggered) {
      return res.status(400).json({
        success: false,
        message: result.message || "Netlify build hook is not configured",
      });
    }

    res.json({ success: true, message: "Netlify rebuild triggered" });
  } catch (error) {
    console.error("Manual public data rebuild error:", error);
    res.status(500).json({ success: false, message: "Failed to trigger rebuild" });
  }
});

module.exports = router;
