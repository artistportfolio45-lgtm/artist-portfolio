// models/Artwork.js
// Each artwork has multiple images, metadata, and availability status

const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },       // Cloudinary secure URL
  publicId: { type: String, required: true },  // For Cloudinary deletion
  width: { type: Number, default: null },
  height: { type: Number, default: null },
});

const artworkSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: "Untitled",
    },
    description: { type: String, default: "" },
    category: {
      type: String,
      trim: true,
      default: "Uncategorized",
    },
    price: {
      type: Number,
      default: null,
      min: 0,
    },
    medium: { type: String, default: "" },       // e.g., Oil on Canvas
    dimensions: { type: String, default: "" },   // e.g., 24" x 36"
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    images: [imageSchema],
    clientUploadId: { type: String, unique: true, sparse: true, trim: true },
    uploadBatchId: { type: String, trim: true },
    uploadStatus: { type: String, enum: ["success", "failed"], default: "success" },
    uploadedBy: { type: String, trim: true },
    // Denormalized for easy display
    year: { type: Number, default: null },
  },
  { timestamps: true }
);

// Text index for search
artworkSchema.index({ title: "text", description: "text", category: "text", medium: "text" });

module.exports = mongoose.model("Artwork", artworkSchema);
