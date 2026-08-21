const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  MAX_SEARCH_QUERY_LENGTH,
  normalizeSearchText,
  prepareSearchQuery,
  searchAndRankArtworks,
} = require("../utils/artworkSearch");
const { cleanTextList, sanitizePublicArtwork } = require("../utils/publicArtwork");

const works = [
  { _id: "1", title: "Buddha Under the Bodhi Tree", medium: "Oil on canvas", year: 2021, category: "Spiritual", tags: ["meditation"] },
  { _id: "2", title: "Quiet Landscape", description: "A distant buddha figure", medium: "Watercolour", year: 2019, category: "Landscape" },
  { _id: "3", title: "Monsoon-Light", medium: "Mixed media", year: 2021, category: "Abstract", collection: "Rain Studies" },
];

test("normalization handles case, whitespace, punctuation, hyphens and bounded input", () => {
  assert.equal(normalizeSearchText("  MONSOON—Light!!  "), "monsoon light");
  assert.equal(prepareSearchQuery("a").valid, false);
  assert.equal(prepareSearchQuery("ab").valid, true);
  assert.equal(prepareSearchQuery("x".repeat(500)).raw.length, MAX_SEARCH_QUERY_LENGTH);
  assert.deepEqual(searchAndRankArtworks([{ _id: "missing", title: null, description: undefined }], "buddha"), []);
});

test("partial, multi-keyword, reordered and typo-tolerant searches match", () => {
  for (const query of ["Buddha", "Budd", "Bodhi", "Tree", "buddha tree", "tree buddha", "under bodhi", "Budha", "bodhi tre", "  BUDDHA   TREE  ", "oil 2021", "Spiritual"]) {
    assert.equal(searchAndRankArtworks(works, query)[0]?._id, "1", query);
  }
  assert.equal(searchAndRankArtworks(works, "monsoon light")[0]?._id, "3");
  assert.deepEqual(searchAndRankArtworks(works, "buddha sculpture"), []);
  assert.deepEqual(searchAndRankArtworks(works, ".*+?[]{}()"), []);
});

test("title matches outrank metadata matches and duplicate IDs are removed", () => {
  const ranked = searchAndRankArtworks([...works, { ...works[0], title: "Duplicate" }], "buddha");
  assert.deepEqual(ranked.map((work) => work._id), ["1", "2"]);
});

test("all requested public metadata fields are searchable", () => {
  const metadata = {
    _id: "metadata",
    title: "Study",
    dimensions: "40 x 60 cm",
    series: "River Memory",
    catalogueNumber: "GNA-042",
    creationLocation: "Mumbai",
    provenance: "Private collection",
    exhibitionHistory: "Delhi Biennale",
    publications: "Modern Art Review",
    keywords: ["azure"],
  };
  for (const query of ["40 60", "river", "GNA 042", "Mumbai", "private", "biennale", "modern review", "azure"]) {
    assert.equal(searchAndRankArtworks([metadata], query).length, 1, query);
  }
});

test("public artwork output excludes upload and Cloudinary management fields", () => {
  const publicWork = sanitizePublicArtwork({
    ...works[0],
    clientUploadId: "private-client",
    uploadBatchId: "private-batch",
    uploadStatus: "success",
    uploadedBy: "private-user",
    images: [{ url: "https://example.test/work.jpg", publicId: "private-public-id", width: 800, height: 600 }],
  });
  for (const key of ["clientUploadId", "uploadBatchId", "uploadStatus", "uploadedBy", "__v"]) {
    assert.equal(key in publicWork, false, key);
  }
  assert.equal("publicId" in publicWork.images[0], false);
  assert.deepEqual(cleanTextList("Blue, blue; Calm\nLight"), ["Blue", "Calm", "Light"]);
});

test("public route uses bounded application ranking instead of Mongo text search", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../routes/artworks.js"), "utf8");
  assert.doesNotMatch(source, /query\.\$text|\{\s*\$search:/);
  assert.match(source, /const candidates = await Artwork\.find\(query\)/);
  assert.match(source, /searchAndRankArtworks\(/);
  assert.match(source, /ranked\.slice\(skip, skip \+ pageSize\)/);
  assert.match(source, /artworks: artworks\.map\(sanitizePublicArtwork\)/);
});
