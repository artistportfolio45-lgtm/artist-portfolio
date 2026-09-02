const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDuplicateGroups, duplicateReason, hammingDistance, normalizeFilename, sha256 } = require("../utils/artworkDuplicates");

test("duplicate fingerprints detect exact and near-identical images without relying on filenames", () => {
  assert.equal(sha256(Buffer.from("art")), sha256(Buffer.from("art")));
  assert.equal(hammingDistance("0000", "0001"), 1);
  assert.equal(duplicateReason({ contentHash: "same" }, { contentHash: "same" }), "identical file");
  assert.equal(duplicateReason({ perceptualHash: "0000" }, { perceptualHash: "0003" }), "visually identical image");
  assert.equal(normalizeFilename(" My-ART_work.JPG "), "my art work");
});

test("new uploads use Cloudinary's ETag fingerprint so they match fingerprints from legacy scans", async () => {
  const source = await require("node:fs/promises").readFile(require.resolve("../routes/artworks"), "utf8");
  assert.match(source, /const cloudinaryFingerprint/);
  assert.match(source, /contentHash: optionalText\(resource\?\.etag\)/);
  assert.match(source, /const fingerprint = cloudinaryFingerprint\(uploaded, contentHash\)/);
  assert.match(source, /router\.post\("\/", protect, adminOnly, uploadBulkArtwork\.array\("images", 10\)/);
  assert.match(source, /const firstUpload = await uploadBulkImage\(req\.files\[0\], singleUploadPublicId\)/);
  assert.match(source, /const fingerprint = cloudinaryFingerprint\(firstUpload, sha256\(req\.files\[0\]\.buffer\)\)/);
  assert.match(source, /const duplicate = await findDuplicateArtwork\(fingerprint\)/);
  assert.match(source, /fingerprintVersion: 2/);
  assert.match(source, /artwork\.fingerprintVersion >= 2/);
});

test("automatic duplicate grouping keeps the oldest artwork", () => {
  const artworks = [
    { _id: "new", contentHash: "same", createdAt: new Date("2026-01-02") },
    { _id: "old", contentHash: "same", createdAt: new Date("2026-01-01") },
    { _id: "different", contentHash: "other", createdAt: new Date("2025-01-01") },
  ];
  const groups = buildDuplicateGroups(artworks);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].keep._id, "old");
  assert.deepEqual(groups[0].duplicates.map((item) => item._id), ["new"]);
});

test("legacy duplicate scan is bounded for production request timeouts", async () => {
  const source = await require("node:fs/promises").readFile(require.resolve("../routes/artworks"), "utf8");
  assert.match(source, /Math\.min\(25,/);
  assert.match(source, /nextOffset/);
  assert.match(source, /complete/);
});

test("authenticated duplicate scan batches do not consume the general login-protecting limit", async () => {
  const source = await require("node:fs/promises").readFile(require.resolve("../middleware/rateLimiter"), "utf8");
  assert.match(source, /req\.path === "\/artworks\/duplicates\/scan"/);
});

test("selected duplicate removal re-verifies IDs and rejects protected originals", async () => {
  const source = await require("node:fs/promises").readFile(require.resolve("../routes/artworks"), "utf8");
  assert.match(source, /confirmedDuplicates/);
  assert.match(source, /Selection contains an artwork that is not a confirmed duplicate/);
  assert.match(source, /requestedIds\.some\(\(id\) => !confirmedIds\.has\(id\)\)/);
});
