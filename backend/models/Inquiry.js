// models/Inquiry.js
// Visitor inquiries — no payment, just contact requests

const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    phone: { type: String, default: "" },
    subject: {
      type: String,
      trim: true,
      default: "General Enquiry",
    },
    message: {
      type: String,
      required: [true, "Message is required"],
    },
    inquiryType: {
      type: String,
      enum: ["contact", "artwork"],
      default: "contact",
    },
    artwork: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artwork",
      default: null,
    },
    artworkInterested: {
      // Reference to Artwork — optional (general inquiries allowed)
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artwork",
      default: null,
    },
    artworkTitle: {
      // Stored separately so it remains readable even if artwork is deleted
      type: String,
      default: "",
    },
    artworkUrl: {
      type: String,
      default: "",
    },
    sourcePage: {
      type: String,
      default: "",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

inquirySchema.index({ deletedAt: 1, createdAt: -1, _id: -1 });
inquirySchema.index({ deletedAt: 1, isRead: 1, createdAt: -1 });
inquirySchema.index({ deletedAt: 1, isResolved: 1, createdAt: -1 });
inquirySchema.index({ deletedAt: 1, inquiryType: 1, createdAt: -1 });

module.exports = mongoose.model("Inquiry", inquirySchema);
