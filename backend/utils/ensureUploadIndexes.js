const Artwork = require("../models/Artwork");
const UploadBatch = require("../models/UploadBatch");

const ARTWORK_CLIENT_UPLOAD_INDEX = {
  keys: { clientUploadId: 1 },
  options: { unique: true, sparse: true, name: "clientUploadId_1" },
};

const UPLOAD_BATCH_INDEX = {
  keys: { uploadBatchId: 1 },
  options: { unique: true, name: "uploadBatchId_1" },
};

const ensureUploadIndexes = async ({
  artworkCollection = Artwork.collection,
  uploadBatchCollection = UploadBatch.collection,
  logger = console,
} = {}) => {
  try {
    await artworkCollection.createIndex(
      ARTWORK_CLIENT_UPLOAD_INDEX.keys,
      ARTWORK_CLIENT_UPLOAD_INDEX.options
    );
    await uploadBatchCollection.createIndex(
      UPLOAD_BATCH_INDEX.keys,
      UPLOAD_BATCH_INDEX.options
    );
    logger.log("Verified artwork upload idempotency indexes.");
  } catch (error) {
    const reason = error?.code === 11000
      ? "Existing duplicate upload IDs prevent a unique index from being created. No data was changed."
      : "MongoDB could not verify the required upload indexes. No data was changed.";
    const migrationError = new Error(`${reason} ${error.message || ""}`.trim());
    migrationError.cause = error;
    throw migrationError;
  }
};

module.exports = {
  ensureUploadIndexes,
  ARTWORK_CLIENT_UPLOAD_INDEX,
  UPLOAD_BATCH_INDEX,
};
