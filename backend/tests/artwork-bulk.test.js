const assert = require("node:assert/strict");
const test = require("node:test");

const artworkRouter = require("../routes/artworks");

test("bulk artwork route is registered before the artwork id route", () => {
  const paths = artworkRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);
  assert.ok(paths.includes("/bulk"));
  assert.ok(paths.indexOf("/bulk") < paths.indexOf("/:id"));
});

test("bulk titles are cleanly derived from filenames", () => {
  const { titleFromFilename } = artworkRouter.__testables;
  assert.equal(titleFromFilename("summer_study-02.webp"), "Summer Study 02");
  assert.equal(titleFromFilename("  .png"), "Untitled");
});

test("bounded worker pool preserves all results", async () => {
  const { runWithConcurrency, BULK_UPLOAD_CONCURRENCY } = artworkRouter.__testables;
  let running = 0;
  let peak = 0;
  const output = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], BULK_UPLOAD_CONCURRENCY, async (item) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 3));
    running -= 1;
    return item * 2;
  });

  assert.deepEqual(output, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= BULK_UPLOAD_CONCURRENCY);
});
