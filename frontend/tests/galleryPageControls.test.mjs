import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/pages/public/GalleryPage.jsx", import.meta.url), "utf8");

test("Gallery removes collection, medium, and decade controls and supports direct page jumps", () => {
  for (const label of ["Filter by collection", "Filter by medium", "Filter by decade"]) {
    assert.doesNotMatch(source, new RegExp(label, "i"));
  }
  assert.match(source, /Jump to Gallery page/);
  assert.match(source, /id="gallery-page-number"/);
  assert.match(source, /goToPage\(target\)/);
  assert.match(source, /max=\{totalPages\}/);
});
