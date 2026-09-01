import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/pages/public/GalleryPage.jsx", import.meta.url), "utf8");
const navbarSource = await readFile(new URL("../src/components/public/Navbar.jsx", import.meta.url), "utf8");

test("Gallery removes collection, medium, and decade controls and supports direct page jumps", () => {
  for (const label of ["Filter by collection", "Filter by medium", "Filter by decade"]) {
    assert.doesNotMatch(source, new RegExp(label, "i"));
  }
  assert.match(source, /Jump to Gallery page/);
  assert.match(source, /id="gallery-page-number"/);
  assert.match(source, /goToPage\(target\)/);
  assert.match(source, /max=\{totalPages\}/);
});

test("Gallery only locks mobile filter dialogs and releases the lock when a filter is applied", () => {
  assert.match(source, /if \(!filtersOpen \|\| !isMobileFilterDialog\) return undefined/);
  assert.match(source, /setFiltersOpen\(false\);\s+setPage\(nextPage\)/);
});

test("desktop navigation exposes direct Gallery page links and preserves active filters", () => {
  assert.match(navbarSource, /Gallery pages/);
  assert.match(navbarSource, /group-hover\/gallery:opacity-100/);
  assert.match(navbarSource, /Array\.from\(\{ length: galleryPageCount \}/);
  assert.match(navbarSource, /new URLSearchParams\(location\.search\)/);
  assert.match(navbarSource, /aria-current=\{isCurrent \? "page" : undefined\}/);
});
