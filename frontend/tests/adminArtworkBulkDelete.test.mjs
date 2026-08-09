import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageSource = fs.readFileSync(path.resolve(__dirname, "../src/pages/admin/ArtworksPage.jsx"), "utf8");
const apiSource = fs.readFileSync(path.resolve(__dirname, "../src/services/api.js"), "utf8");

test("admin artworks page exposes page-scoped bulk selection and confirmation", () => {
  assert.match(pageSource, /selectedIds/);
  assert.match(pageSource, /Select Page/);
  assert.match(pageSource, /indeterminate = someVisibleSelected && !allVisibleSelected/);
  assert.match(pageSource, /Delete Selected/);
  assert.match(pageSource, /Delete \{selectedCount\}/);
  assert.match(pageSource, /This action cannot be undone/);
});

test("artwork API exposes authenticated bulk delete request body", () => {
  assert.match(apiSource, /bulkDelete: \(ids\) => api\.delete\("\/artworks\/bulk", \{ data: \{ ids \} \}\)/);
});

test("bulk delete schedules one rebuild warning without using the missing artwork rebuild endpoint", () => {
  assert.match(pageSource, /publicSnapshotAPI\.rebuild\("artwork-bulk-deleted"\)/);
  assert.match(pageSource, /Artworks deleted, but public gallery rebuild could not be scheduled\./);
  assert.doesNotMatch(apiSource, /artworks\/rebuild/);
  assert.doesNotMatch(pageSource, /artworks\/rebuild/);
});
