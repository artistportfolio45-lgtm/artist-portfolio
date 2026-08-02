const mongoose = require("mongoose");

const uploadBatchSchema = new mongoose.Schema(
  {
    uploadBatchId: { type: String, required: true, unique: true, trim: true },
    selectedCount: { type: Number, default: 0, min: 0 },
    successfulCount: { type: Number, default: 0, min: 0 },
    failedCount: { type: Number, default: 0, min: 0 },
    uploadedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UploadBatch", uploadBatchSchema);
