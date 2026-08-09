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
  assert.ok(paths.includes("/rebuild"));
  assert.ok(paths.indexOf("/bulk") < paths.indexOf("/:id"));
  assert.ok(paths.indexOf("/rebuild") < paths.indexOf("/:id"));
});

test("DELETE /bulk is claimed by the bulk route before the dynamic id route can match it", () => {
  const matchingDeleteRoutes = artworkRouter.stack
    .filter((layer) => layer.route?.methods?.delete && layer.match("/bulk"))
    .map((layer) => layer.route.path);

  assert.deepEqual(matchingDeleteRoutes.slice(0, 2), ["/bulk", "/:id"]);
});

test("fixed artwork rebuild route is registered before the dynamic id route", () => {
  const matchingPostRoutes = artworkRouter.stack
    .filter((layer) => layer.route?.methods?.post && layer.match("/rebuild"))
    .map((layer) => layer.route.path);
  const routes = artworkRouter.stack.filter((layer) => layer.route);
  const rebuildRoute = routes.find((layer) => layer.route.path === "/rebuild" && layer.route.methods.post);
  const dynamicImageRoute = routes.find((layer) => layer.route.path === "/:id/images" && layer.route.methods.post);

  assert.equal(matchingPostRoutes[0], "/rebuild");
  assert.ok(routes.indexOf(rebuildRoute) < routes.indexOf(dynamicImageRoute));
});

test("bulk artwork delete route validates ids and cleans up Cloudinary before MongoDB", () => {
  const routes = artworkRouter.stack.filter((layer) => layer.route);
  const bulkDelete = routes.find((layer) => layer.route.path === "/bulk" && layer.route.methods.delete);
  const idRoute = routes.find((layer) => layer.route.path === "/:id");
  assert.ok(bulkDelete);
  assert.ok(routes.indexOf(bulkDelete) < routes.indexOf(idRoute));

  const source = fs.readFileSync(path.resolve(__dirname, "../routes/artworks.js"), "utf8");
  assert.match(source, /router\.delete\("\/bulk", protect, adminOnly/);
  assert.match(source, /mongoose\.isValidObjectId/);
  assert.match(source, /deleteCloudinaryImages\(imagePublicIdsFor\(artworks\)\)/);
  assert.match(source, /No artwork records were deleted/);
  assert.match(source, /Artwork\.deleteMany/);
  assert.match(source, /withTransaction/);
  assert.match(source, /safeTriggerStaticRebuild\("artwork-bulk-deleted"\)/);
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

test("bulk upload implementation is strictly sequential and has no file-count cap", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../routes/artworks.js"), "utf8");
  const config = fs.readFileSync(path.resolve(__dirname, "../config/cloudinary.js"), "utf8");
  const frontend = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/pages/admin/BulkArtworkUploadPage.jsx"), "utf8");
  assert.match(source, /for \(let index = 0; index < files\.length; index \+= 1\)/);
  assert.doesNotMatch(source, /runWithConcurrency|BULK_UPLOAD_CONCURRENCY/);
  assert.doesNotMatch(config, /MAX_BULK_ARTWORKS|files:\s*\d+/);
  assert.match(frontend, /for \(const item of selected\) await uploadOne/);
  assert.doesNotMatch(frontend, /MAX_ARTWORKS|Promise\.all/);
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
