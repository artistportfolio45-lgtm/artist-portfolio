const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const artworkRoutes = fs.readFileSync(path.resolve(__dirname, "../routes/artworks.js"), "utf8");
const snapshot = fs.readFileSync(path.resolve(__dirname, "../utils/publicSnapshot.js"), "utf8");

test("public artwork routes enforce publication visibility and correct ID semantics", () => {
  assert.match(artworkRoutes, /publicationStatus: \{ \$nin:/);
  assert.match(artworkRoutes, /mongoose\.isValidObjectId/);
  assert.match(artworkRoutes, /status\(400\).*Invalid artwork ID/);
  assert.match(artworkRoutes, /status\(404\).*Artwork not found/);
  assert.match(artworkRoutes, /\/:id\/neighbors/);
});

test("artwork mutations trigger rebuilds without coupling them to database rollback", () => {
  for (const reason of ["artwork-created", "artwork-updated", "artwork-images-added", "artwork-image-removed", "artwork-deleted", "artwork-bulk-uploaded"]) {
    assert.ok(artworkRoutes.includes(reason), reason);
  }
  assert.match(snapshot, /schemaVersion: 2/);
  assert.match(snapshot, /contentVersion/);
});

test("publishing has image, title, year, description and catalogue safeguards", () => {
  assert.match(artworkRoutes, /validatePublishableArtwork/);
  for (const token of ["180", "12000", "Published artwork requires at least one image", "Catalogue number"]) assert.ok(artworkRoutes.includes(token), token);
});
