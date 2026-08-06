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

const ARTWORK_PUBLIC_INDEXES = [
  { keys: { publicationStatus: 1, createdAt: -1, _id: -1 }, options: {} },
  { keys: { publicationStatus: 1, category: 1, year: -1, _id: -1 }, options: {} },
  { keys: { catalogueNumber: 1 }, options: { unique: true, name: "catalogueNumber_1", partialFilterExpression: { catalogueNumber: { $type: "string", $gt: "" } } } },
];

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const hasEquivalentIndex = async (collection, { keys, options }) => {
  const indexes = await collection.indexes();
  return indexes.some((index) => (
    sameValue(index.key, keys) &&
    Boolean(index.unique) === Boolean(options.unique) &&
    Boolean(index.sparse) === Boolean(options.sparse) &&
    sameValue(index.partialFilterExpression || null, options.partialFilterExpression || null)
  ));
};

const ensurePublicIndex = async (collection, index) => {
  try {
    await collection.createIndex(index.keys, index.options);
  } catch (error) {
    if (error?.code === 85 && await hasEquivalentIndex(collection, index)) return;
    throw error;
  }
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
    for (const index of ARTWORK_PUBLIC_INDEXES) {
      await ensurePublicIndex(artworkCollection, index);
    }
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
  ARTWORK_PUBLIC_INDEXES,
};
