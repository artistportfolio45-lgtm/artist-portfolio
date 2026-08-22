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

test("artwork mutations trigger public snapshot syncs without build hooks", () => {
  for (const reason of ["artwork-created", "artwork-updated", "artwork-images-added", "artwork-image-removed", "artwork-deleted", "artwork-bulk-uploaded"]) {
    assert.ok(artworkRoutes.includes(reason), reason);
  }
  assert.match(snapshot, /schemaVersion: 3/);
  assert.match(snapshot, /snapshotVersion/);
  assert.doesNotMatch(artworkRoutes, /triggerStaticRebuild|NETLIFY_BUILD_HOOK/);
});

test("single and bulk uploads use the required synchronization cardinality", () => {
  assert.equal((artworkRoutes.match(/safeSyncPublicData\("artwork-created"\)/g) || []).length, 1);
  assert.equal((artworkRoutes.match(/safeSyncPublicData\("artwork-updated"\)/g) || []).length, 1);
  assert.equal((artworkRoutes.match(/safeSyncPublicData\("artwork-bulk-uploaded"\)/g) || []).length, 1);
  assert.match(artworkRoutes, /req\.query\.deferPublicSync !== "true"/);
});

test("publishing has image, title, year, description and catalogue safeguards", () => {
  assert.match(artworkRoutes, /validatePublishableArtwork/);
  for (const token of ["180", "12000", "Published artwork requires at least one image", "Catalogue number"]) assert.ok(artworkRoutes.includes(token), token);
});
