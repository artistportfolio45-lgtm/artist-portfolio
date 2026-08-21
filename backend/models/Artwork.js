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
    collection: { type: String, trim: true, default: "" },
    series: { type: String, trim: true, default: "" },
    catalogueNumber: { type: String, trim: true, default: "" },
    provenance: { type: String, default: "" },
    exhibitionHistory: { type: String, default: "" },
    publications: { type: String, default: "" },
    creationLocation: { type: String, trim: true, default: "" },
    tags: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
    keywords: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
    publicationStatus: {
      type: String,
      enum: ["draft", "published", "unpublished", "archived"],
      default: "published",
      index: true,
    },
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
  { timestamps: true, suppressReservedKeysWarning: true }
);

// Search relevance is calculated from the bounded public metadata projection.
// Existing deployments may retain their legacy MongoDB text index; it is no
// longer used by the public Gallery search.
artworkSchema.index({ publicationStatus: 1, createdAt: -1, _id: -1 });
artworkSchema.index({ publicationStatus: 1, category: 1, year: -1, _id: -1 });
artworkSchema.index({ catalogueNumber: 1 }, { unique: true, partialFilterExpression: { catalogueNumber: { $type: "string", $gt: "" } } });

module.exports = mongoose.model("Artwork", artworkSchema);
