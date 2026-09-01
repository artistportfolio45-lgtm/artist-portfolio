import test from "node:test";
import assert from "node:assert/strict";
import {
  GALLERY_THUMBNAIL_WIDTHS,
  cloudinaryThumbnailUrl,
  galleryThumbnailWidths,
  imageAspectRatio,
  isCloudinaryDeliveryUrl,
} from "../src/utils/imageDelivery.js";

const cloudinaryUrl =
  "https://res.cloudinary.com/demo/image/upload/v123/artist-portfolio/artworks/example.jpg";

test("recognizes only Cloudinary image delivery URLs", () => {
  assert.equal(isCloudinaryDeliveryUrl(cloudinaryUrl), true);
  assert.equal(isCloudinaryDeliveryUrl("https://example.com/image/upload/example.jpg"), false);
  assert.equal(isCloudinaryDeliveryUrl("not a URL"), false);
});

test("adds bounded size plus automatic format and quality transformations", () => {
  assert.equal(
    cloudinaryThumbnailUrl(cloudinaryUrl, 960),
    "https://res.cloudinary.com/demo/image/upload/c_limit,w_960/f_auto,q_auto/v123/artist-portfolio/artworks/example.jpg"
  );
  assert.equal(
    cloudinaryThumbnailUrl(`${cloudinaryUrl}?version=1`, 480),
    "https://res.cloudinary.com/demo/image/upload/c_limit,w_480/f_auto,q_auto/v123/artist-portfolio/artworks/example.jpg?version=1"
  );
});

test("leaves non-Cloudinary and invalid-width URLs unchanged", () => {
  const externalUrl = "https://images.example.com/artwork.jpg";
  assert.equal(cloudinaryThumbnailUrl(externalUrl, 960), externalUrl);
  assert.equal(cloudinaryThumbnailUrl(cloudinaryUrl, 0), cloudinaryUrl);
});

test("caps and deduplicates srcset widths to the source image width", () => {
  assert.deepEqual(galleryThumbnailWidths(null), GALLERY_THUMBNAIL_WIDTHS);
  assert.deepEqual(galleryThumbnailWidths(0.4), GALLERY_THUMBNAIL_WIDTHS);
  assert.deepEqual(galleryThumbnailWidths(400), [240, 320, 400]);
  assert.deepEqual(galleryThumbnailWidths(600), [240, 320, 480, 600]);
  assert.deepEqual(galleryThumbnailWidths(960), [240, 320, 480, 720, 960]);
  assert.deepEqual(galleryThumbnailWidths(1200), [240, 320, 480, 720, 960, 1200]);
  assert.deepEqual(galleryThumbnailWidths(4000), GALLERY_THUMBNAIL_WIDTHS);
});

test("offers compact mobile candidates before larger desktop widths", () => {
  assert.deepEqual(GALLERY_THUMBNAIL_WIDTHS, [240, 320, 480, 720, 960, 1440]);
});

test("uses source dimensions for a stable ratio and a safe legacy fallback", () => {
  assert.equal(imageAspectRatio({ width: 8070, height: 5196 }), "8070 / 5196");
  assert.equal(imageAspectRatio({ width: null, height: null }), "4 / 5");
});
