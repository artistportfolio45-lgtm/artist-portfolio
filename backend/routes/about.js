const express = require("express");
const { getOrCreateAboutPage, publicAboutContent } = require("../utils/aboutPage");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const aboutPage = await getOrCreateAboutPage();
    res.json({ success: true, about: publicAboutContent(aboutPage) });
  } catch (error) {
    console.error("Public About page error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
