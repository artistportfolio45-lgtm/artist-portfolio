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
