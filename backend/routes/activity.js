const express = require("express");
const ActivityLog = require("../models/ActivityLog");
const { protect } = require("../middleware/auth");
const adminOnly = (req, res, next) => req.user?.role === "admin"
  ? next()
  : res.status(403).json({ success: false, message: "Admin access required" });

const router = express.Router();

router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const { module, page = 1, limit = 20 } = req.query;
    const query = {};

    if (module && module !== "all") {
      query.module = module;
    }

    const numericPage = Math.max(1, parseInt(page, 10) || 1);
    const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (numericPage - 1) * numericLimit;

    const [activities, total] = await Promise.all([
      ActivityLog.find(query)
        .populate("admin", "email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(numericLimit),
      ActivityLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      message: "Activity logs loaded",
      data: {
        activities,
        pagination: {
          total,
          page: numericPage,
          limit: numericLimit,
          pages: Math.ceil(total / numericLimit),
        },
      },
      activities,
      pagination: {
        total,
        page: numericPage,
        limit: numericLimit,
        pages: Math.ceil(total / numericLimit),
      },
    });
  } catch (error) {
    console.error("Get activity logs error:", error);
    res.status(500).json({ success: false, message: "Server error", errors: [] });
  }
});

module.exports = router;
