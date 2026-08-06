import assert from "node:assert/strict";
import test from "node:test";
import { galleryRestoreTargetY, normalizeGalleryPage } from "../src/utils/galleryRestore.js";

test("gallery restoration keeps the selected artwork at its prior viewport offset", () => {
  assert.equal(galleryRestoreTargetY({
    savedScrollY: 1800,
    savedAnchorOffset: 220,
    currentScrollY: 0,
    currentAnchorOffset: 2020,
  }), 1800);
  assert.equal(galleryRestoreTargetY({
    savedScrollY: 1800,
    savedAnchorOffset: 220,
    currentScrollY: 300,
    currentAnchorOffset: 1720,
  }), 1800);
});

test("gallery restoration falls back safely and page values stay bounded", () => {
  assert.equal(galleryRestoreTargetY({ savedScrollY: 640 }), 640);
  assert.equal(normalizeGalleryPage("3"), 3);
  assert.equal(normalizeGalleryPage("0"), 1);
});
