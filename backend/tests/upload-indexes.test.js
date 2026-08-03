const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  ensureUploadIndexes,
  ARTWORK_CLIENT_UPLOAD_INDEX,
  UPLOAD_BATCH_INDEX,
  ARTWORK_PUBLIC_INDEXES,
} = require("../utils/ensureUploadIndexes");

test("startup migration creates the exact sparse and unique upload indexes", async () => {
  const calls = [];
  const collection = (name) => ({
    async createIndex(keys, options) {
      calls.push({ name, keys, options });
      return options.name;
    },
  });

  await ensureUploadIndexes({
    artworkCollection: collection("artworks"),
    uploadBatchCollection: collection("uploadbatches"),
    logger: { log() {} },
  });

  assert.deepEqual(calls, [
    { name: "artworks", ...ARTWORK_CLIENT_UPLOAD_INDEX },
    { name: "uploadbatches", ...UPLOAD_BATCH_INDEX },
    ...ARTWORK_PUBLIC_INDEXES.map((index) => ({ name: "artworks", ...index })),
  ]);
  assert.deepEqual(ARTWORK_CLIENT_UPLOAD_INDEX, {
    keys: { clientUploadId: 1 },
    options: { unique: true, sparse: true, name: "clientUploadId_1" },
  });
  assert.deepEqual(UPLOAD_BATCH_INDEX, {
    keys: { uploadBatchId: 1 },
    options: { unique: true, name: "uploadBatchId_1" },
  });
});

test("startup migration reports duplicate data without mutating it", async () => {
  const duplicateError = Object.assign(new Error("duplicate key"), { code: 11000 });
  const artworkCollection = {
    async createIndex() { throw duplicateError; },
  };
  let uploadBatchIndexAttempted = false;

  await assert.rejects(
    ensureUploadIndexes({
      artworkCollection,
      uploadBatchCollection: {
        async createIndex() { uploadBatchIndexAttempted = true; },
      },
      logger: { log() {} },
    }),
    /No data was changed/
  );
  assert.equal(uploadBatchIndexAttempted, false);
});

test("server runs the index migration after connecting and before serving", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  const connectAt = source.indexOf("await connectDB()");
  const migrateAt = source.indexOf("await ensureUploadIndexes()");
  const listenAt = source.indexOf("app.listen(");

  assert.ok(connectAt >= 0);
  assert.ok(migrateAt > connectAt);
  assert.ok(listenAt > migrateAt);
});
