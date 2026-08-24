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
