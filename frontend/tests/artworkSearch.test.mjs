import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildArtworkSearchSuggestions,
  normalizeSearchText,
  searchAndRankArtworks,
} from "../src/utils/artworkSearch.js";
import { queryPublicArtworks } from "../src/utils/artworkCollection.js";
import { sanitizePublicSnapshot } from "../src/utils/publicArtwork.js";

const require = createRequire(import.meta.url);
const backendSearch = require("../../backend/utils/artworkSearch.js");
const works = [
  { _id: "1", title: "Buddha Under the Bodhi Tree", category: "Spiritual", medium: "Oil on canvas", year: 2021, isAvailable: true, publicationStatus: "published", createdAt: "2024-01-03" },
  { _id: "2", title: "Quiet Landscape", category: "Landscape", description: "Buddha at dusk", medium: "Watercolour", year: 2020, isAvailable: true, publicationStatus: "published", createdAt: "2024-01-02" },
  { _id: "3", title: "Bodhi Sketch", category: "Spiritual", medium: "Charcoal", year: 2018, isAvailable: false, publicationStatus: "published", createdAt: "2024-01-01" },
  { _id: "4", title: "Hidden Buddha", category: "Spiritual", medium: "Oil", year: 2022, isAvailable: true, publicationStatus: "draft", createdAt: "2024-01-04" },
];

test("frontend and backend search engines stay behaviorally identical", () => {
  for (const query of ["Budd", "bodhi tree", "tree buddha", "Budha", "oil 2021", "MONSOON—LIGHT"]) {
    const frontend = searchAndRankArtworks(works, query).map((artwork) => artwork._id);
    const backend = backendSearch.searchAndRankArtworks(works, query).map((artwork) => artwork._id);
    assert.deepEqual(frontend, backend, query);
  }
  assert.equal(normalizeSearchText("  Buddha--Tree "), "buddha tree");
});

test("filters run before relevance and the full set is ranked before pagination", () => {
  const result = queryPublicArtworks(works, {
    category: "Spiritual",
    available: "true",
    search: "buddha",
    page: 1,
    limit: 1,
    sort: "createdAt",
    order: "desc",
  });
  assert.equal(result.pagination.total, 1);
  assert.deepEqual(result.items.map((artwork) => artwork._id), ["1"]);
});

test("a match beyond the first 50 source records is found before pagination", () => {
  const largeCollection = Array.from({ length: 75 }, (_, index) => ({
    _id: String(index),
    title: index === 70 ? "Buddha Beyond Page One" : `Archive Study ${index}`,
    category: "Study",
    isAvailable: true,
    publicationStatus: "published",
    createdAt: new Date(2024, 0, index + 1).toISOString(),
  }));
  const result = queryPublicArtworks(largeCollection, { search: "Budd", page: 1, limit: 50 });
  assert.equal(result.pagination.total, 1);
  assert.equal(result.items[0]._id, "70");
});

test("relevance remains deterministic and duplicate IDs never render", () => {
  const result = queryPublicArtworks([...works, { ...works[0] }], { search: "buddha", limit: 50 });
  assert.deepEqual(result.items.map((artwork) => artwork._id), ["1", "2"]);
  assert.equal(new Set(result.items.map((artwork) => artwork._id)).size, result.items.length);
});

test("suggestions are bounded, deduplicated and metadata-labelled", () => {
  const suggestions = buildArtworkSearchSuggestions(works, "bod", 5);
  assert.ok(suggestions.length <= 5);
  assert.ok(suggestions.some((item) => item.type === "title" && item.label.includes("Bodhi")));
  assert.equal(new Set(suggestions.map((item) => `${item.type}:${item.label}`)).size, suggestions.length);
});

test("snapshot sanitization strips private artwork and image management data", () => {
  const sanitized = sanitizePublicSnapshot({
    artworks: [{ ...works[0], clientUploadId: "secret", uploadedBy: "admin", images: [{ url: "https://example.test/a.jpg", publicId: "cloud-secret" }] }],
    categories: ["Spiritual", "Spiritual"],
  });
  assert.equal("clientUploadId" in sanitized.artworks[0], false);
  assert.equal("uploadedBy" in sanitized.artworks[0], false);
  assert.equal("publicId" in sanitized.artworks[0].images[0], false);
  assert.deepEqual(sanitized.categories, ["Spiritual"]);
});

test("Gallery exposes debounced URL search, clear, suggestions and stale-result protection", async () => {
  const source = await readFile(new URL("../src/pages/public/GalleryPage.jsx", import.meta.url), "utf8");
  assert.match(source, /SEARCH_DEBOUNCE_MS = 250/);
  assert.match(source, /nextParams\.set\("search", nextSearch\)/);
  assert.match(source, /params\.get\("search"\) \|\| params\.get\("q"\)/);
  assert.doesNotMatch(source, /setArtworks\(\[\]\)/);
  for (const token of ["role=\"combobox\"", "role=\"listbox\"", "aria-activedescendant", "Clear Gallery search", "getSearchSuggestions", "Searching..."]) {
    assert.ok(source.includes(token), token);
  }
  for (const token of ["ArrowDown", "ArrowUp", "Escape", "No artworks found", "Try adjusting the search or filters", "readGalleryRestoreState", "restoreState.filters?.search", "next.set(\"search\", restoreSearch)"]) {
    assert.ok(source.includes(token), token);
  }
});
