import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const apiSource = await readFile(new URL("../src/services/api.js", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/pages/admin/BulkArtworkUploadPage.jsx", import.meta.url), "utf8");

test("duplicate scan API is wired and existing artworks are processed in bounded batches", () => {
  assert.match(apiSource, /scanDuplicates:\s*\(offset = 0, batchSize = 25\)/);
  assert.match(apiSource, /removeDuplicates:\s*\(ids\)/);
  assert.match(pageSource, /do\s*{/);
  assert.match(pageSource, /while \(!result\.complete && !duplicateScanControlRef\.current\.stop\)/);
  assert.match(pageSource, /Stop scan/);
  assert.match(pageSource, /Resume scan/);
  assert.match(pageSource, /Duplicate artwork groups/);
  assert.match(pageSource, /Remove selected/);
  assert.match(pageSource, /Remove all/);
});
