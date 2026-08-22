import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createBulkArtworkDeletion } from "../src/utils/bulkArtworkDeletion.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageSource = fs.readFileSync(path.resolve(__dirname, "../src/pages/admin/ArtworksPage.jsx"), "utf8");
const historySource = fs.readFileSync(path.resolve(__dirname, "../src/pages/admin/UploadHistoryPage.jsx"), "utf8");
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

test("upload history supports page and whole-batch selection with permanent-delete confirmation", () => {
  for (const token of [
    "selectedIds",
    "Select current page",
    "Select batch for deletion",
    "Clear selection",
    "Delete selected",
    "Select all artworks on this page",
    "This action cannot be undone",
    "associated Cloudinary images",
  ]) assert.ok(historySource.includes(token), token);
  assert.match(historySource, /artworkAPI\.startDeletionJob\(ids\)/);
  assert.match(historySource, /artworkAPI\.cancelDeletionJob\(activeDeleteJobId\)/);
  assert.match(historySource, /artworkAPI\.getDeletionJob\(activeDeleteJobId/);
  assert.match(historySource, /uploadHistoryDeletionJob\.v1/);
  assert.match(historySource, /uploadHistoryDeleteSelection\.v1/);
  assert.match(historySource, /Stop Now/);
  assert.match(historySource, /Retry \$\{selectedCount\} remaining/);
  assert.match(historySource, /for \(let batchPage = 2; batchPage <= pages; batchPage \+= 1\)/);
  assert.match(historySource, /overflow-x-hidden/);
  assert.match(historySource, /disabled=\{!selectedCount\}/);
});

test("artwork API exposes cancellable deletion-job endpoints", () => {
  assert.match(apiSource, /startDeletionJob: \(ids\) => api\.post\("\/artworks\/deletion-jobs", \{ ids \}\)/);
  assert.match(apiSource, /getDeletionJob: \(jobId, config = \{\}\)/);
  assert.match(apiSource, /cancelDeletionJob: \(jobId\) => api\.post/);
});

test("bulk deletion deduplicates IDs, caps concurrency at five, and rebuilds once", async () => {
  let active = 0;
  let maximumActive = 0;
  let rebuilds = 0;
  const calls = [];
  const job = createBulkArtworkDeletion({
    ids: [...Array.from({ length: 12 }, (_, index) => `art-${index}`), "art-3"],
    deleteArtwork: async (id) => {
      calls.push(id);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
    },
    rebuild: async () => { rebuilds += 1; },
  });
  const result = await job.start();
  assert.equal(maximumActive, 5);
  assert.equal(new Set(calls).size, 12);
  assert.equal(result.total, 12);
  assert.equal(result.deleted, 12);
  assert.equal(result.percentage, 100);
  assert.equal(rebuilds, 1);
});

test("Stop Now is idempotent, cancels queued work, and preserves active results", async () => {
  const started = [];
  const releases = [];
  const job = createBulkArtworkDeletion({
    ids: Array.from({ length: 11 }, (_, index) => `art-${index}`),
    deleteArtwork: (id) => new Promise((resolve) => {
      started.push(id);
      releases.push(resolve);
    }),
  });
  const running = job.start();
  await new Promise((resolve) => setImmediate(resolve));
  job.stop();
  job.stop();
  assert.equal(job.getSnapshot().state, "stopping");
  assert.equal(job.getSnapshot().cancelled, 6);
  releases.forEach((release) => release());
  const result = await running;
  assert.equal(started.length, 5);
  assert.equal(result.state, "stopped");
  assert.equal(result.cancelled, 6);
  assert.equal(result.deleted, 5);
  assert.equal(result.failed, 0);
  assert.equal(result.remaining, 0);
  assert.equal(result.percentage, 100);
});

test("failed and stopped frontend items remain available for retry", async () => {
  const job = createBulkArtworkDeletion({
    ids: ["deleted", "failed"],
    deleteArtwork: async (id) => {
      if (id === "failed") throw new Error("temporary failure");
    },
  });
  const result = await job.start();
  assert.equal(result.deleted, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.retryIds, ["failed"]);
});
