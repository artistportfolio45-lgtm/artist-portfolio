const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const artworkRouter = require("../routes/artworks");
const Artwork = require("../models/Artwork");

test("bulk artwork route is registered before the artwork id route", () => {
  const paths = artworkRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);
  assert.ok(paths.includes("/bulk"));
  assert.ok(paths.indexOf("/bulk") < paths.indexOf("/:id"));
  assert.ok(paths.includes("/deletion-jobs"));
  assert.ok(paths.indexOf("/deletion-jobs") < paths.indexOf("/:id"));
});

test("DELETE /bulk is claimed by the bulk route before the dynamic id route can match it", () => {
  const matchingDeleteRoutes = artworkRouter.stack
    .filter((layer) => layer.route?.methods?.delete && layer.match("/bulk"))
    .map((layer) => layer.route.path);

  assert.deepEqual(matchingDeleteRoutes.slice(0, 2), ["/bulk", "/:id"]);
});

test("artwork routes contain no content deployment endpoint", () => {
  const paths = artworkRouter.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.ok(!paths.includes("/rebuild"));
});

test("bulk artwork delete updates MongoDB and Blob before Cloudinary cleanup", () => {
  const routes = artworkRouter.stack.filter((layer) => layer.route);
  const bulkDelete = routes.find((layer) => layer.route.path === "/bulk" && layer.route.methods.delete);
  const idRoute = routes.find((layer) => layer.route.path === "/:id");
  assert.ok(bulkDelete);
  assert.ok(routes.indexOf(bulkDelete) < routes.indexOf(idRoute));

  const source = fs.readFileSync(path.resolve(__dirname, "../routes/artworks.js"), "utf8");
  assert.match(source, /router\.delete\("\/bulk", protect, adminOnly/);
  assert.match(source, /mongoose\.isValidObjectId/);
  assert.match(source, /const publicIds = imagePublicIdsFor\(artworks\)/);
  assert.match(source, /Artwork\.deleteMany/);
  assert.match(source, /withTransaction/);
  assert.match(source, /safeSyncPublicData\("artwork-bulk-deleted"\)/);
  const mongoIndex = source.indexOf("const deleteResult = await deleteArtworkDocumentsByIds(ids)");
  const syncIndex = source.indexOf('safeSyncPublicData("artwork-bulk-deleted")');
  const cloudinaryIndex = source.indexOf("deleteCloudinaryImages(publicIds)", syncIndex);
  assert.ok(mongoIndex < syncIndex && syncIndex < cloudinaryIndex);
  assert.match(source, /artwork-bulk-deleted/);
});

test("single artwork delete rejects invalid ObjectIds with a clear 400 response", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../routes/artworks.js"), "utf8");
  assert.match(source, /router\.delete\("\/:id", protect, adminOnly/);
  assert.match(source, /!mongoose\.isValidObjectId\(req\.params\.id\)/);
  assert.match(source, /res\.status\(400\)\.json\(\{ success: false, message: "Invalid artwork ID" \}\)/);
});

test("bulk artwork delete collects public ids from all selected artworks", () => {
  const { imagePublicIdsFor } = artworkRouter.__testables;
  assert.deepEqual(
    imagePublicIdsFor([
      { images: [{ publicId: "artist-portfolio/artworks/a" }, { publicId: "" }] },
      { images: [{ publicId: "artist-portfolio/artworks/b" }] },
      { images: null },
      { images: "legacy-invalid-shape" },
      { images: [{ url: "https://res.cloudinary.com/example/image/upload/no-public-id.jpg" }] },
    ]),
    ["artist-portfolio/artworks/a", "artist-portfolio/artworks/b"]
  );
});

test("bulk artwork delete validates request bodies before database work", () => {
  const { validateBulkDeleteIds } = artworkRouter.__testables;
  assert.equal(validateBulkDeleteIds(undefined).message, "Request body is required");
  assert.equal(validateBulkDeleteIds({}).message, "ids is required");
  assert.equal(validateBulkDeleteIds({ ids: "abc" }).message, "ids must be an array");
  assert.equal(validateBulkDeleteIds({ ids: [] }).message, "Select at least one artwork to delete");
  assert.deepEqual(validateBulkDeleteIds({ ids: ["bad-id"] }).invalidIds, ["bad-id"]);

  const validId = "64f0f0f0f0f0f0f0f0f0f0f0";
  assert.deepEqual(validateBulkDeleteIds({ ids: [validId, validId] }), { valid: true, ids: [validId] });
});

test("bulk titles are cleanly derived from filenames", () => {
  const { titleFromFilename } = artworkRouter.__testables;
  assert.equal(titleFromFilename("summer_study-02.webp"), "Summer Study 02");
  assert.equal(titleFromFilename("  .png"), "Untitled");
});

test("bulk upload implementation bounds frontend concurrency and has no file-count cap", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../routes/artworks.js"), "utf8");
  const config = fs.readFileSync(path.resolve(__dirname, "../config/cloudinary.js"), "utf8");
  const frontend = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/pages/admin/BulkArtworkUploadPage.jsx"), "utf8");
  const bulkArtworkConfig = config.slice(
    config.indexOf("const uploadBulkArtwork = multer({"),
    config.indexOf("const uploadProfile = multer")
  );
  assert.match(source, /for \(let index = 0; index < files\.length; index \+= 1\)/);
  assert.doesNotMatch(source, /runWithConcurrency|BULK_UPLOAD_CONCURRENCY/);
  assert.doesNotMatch(config, /MAX_BULK_ARTWORKS|MAX_ARTWORK_FILE_SIZE|files:\s*\d+/);
  assert.doesNotMatch(bulkArtworkConfig, /limits:/);
  assert.match(frontend, /const UPLOAD_CONCURRENCY = 5/);
  assert.match(frontend, /Promise\.all\(Array\.from\(\{ length: Math\.min\(UPLOAD_CONCURRENCY, selected\.length\) \}, worker\)\)/);
  assert.doesNotMatch(frontend, /MAX_ARTWORKS|MAX_FILE_SIZE|under 10 MB|up to 10 MB/);
});

test("clientUploadId has a sparse unique MongoDB index and duplicate-key recovery", () => {
  const uploadIndex = Artwork.schema.indexes().find(([fields]) => fields.clientUploadId === 1);
  assert.ok(uploadIndex);
  assert.equal(uploadIndex[1].unique, true);
  assert.equal(uploadIndex[1].sparse, true);

  const source = fs.readFileSync(path.resolve(__dirname, "../routes/artworks.js"), "utf8");
  assert.match(source, /error\?\.code === 11000/);
  assert.match(source, /Artwork was already uploaded\./);
});

test("protected upload status and history routes precede the public id route", () => {
  const paths = artworkRouter.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  for (const pathName of ["/upload-status/:clientUploadId", "/upload-history", "/upload-history/batches"]) {
    assert.ok(paths.includes(pathName));
    assert.ok(paths.indexOf(pathName) < paths.indexOf("/:id"));
  }
});
