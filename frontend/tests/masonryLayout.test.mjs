import assert from "node:assert/strict";
import test from "node:test";
import { distributeByShortestColumn } from "../src/utils/masonryLayout.js";

const artwork = (id, width, height) => ({ _id: id, images: [{ width, height }] });

test("masonry assigns each artwork to the currently shortest column", () => {
  const columns = distributeByShortestColumn([
    artwork("portrait", 1, 3),
    artwork("square", 1, 1),
    artwork("landscape", 3, 1),
    artwork("next", 1, 1),
  ], 3);

  assert.deepEqual(columns.map((column) => column.map(({ artwork: item }) => item._id)), [
    ["portrait"],
    ["square"],
    ["landscape", "next"],
  ]);
});

test("masonry preserves original indexes and safely handles missing dimensions", () => {
  const columns = distributeByShortestColumn([
    { _id: "legacy", images: [{}] },
    artwork("known", 4, 3),
    artwork("third", 1, 1),
  ], 2);

  assert.deepEqual(columns.flat().map(({ index }) => index).sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(columns.flat().length, 3);
});
