const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  ARTWORK_DELETION_CONCURRENCY,
  cancelArtworkDeletionJob,
  createArtworkDeletionJob,
  getArtworkDeletionJob,
  resetArtworkDeletionJobsForTests,
  startArtworkDeletionJob,
} = require("../utils/artworkDeletionJobs");

const adminId = "507f191e810c19729de860ea";
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test.beforeEach(() => resetArtworkDeletionJobsForTests());

test("deletion jobs deduplicate IDs, never exceed five global deletions, and sync once per job", async () => {
  let active = 0;
  let maximumActive = 0;
  let syncs = 0;
  const calls = [];
  const remove = async (id) => {
    calls.push(id);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await wait(3);
    active -= 1;
    return { status: "deleted" };
  };
  const first = createArtworkDeletionJob({
    ids: [...Array.from({ length: 8 }, (_, index) => `first-${index}`), "first-2"],
    requestedBy: adminId,
    deleteArtwork: remove,
    sync: async () => { syncs += 1; return { success: true }; },
  });
  const second = createArtworkDeletionJob({
    ids: Array.from({ length: 7 }, (_, index) => `second-${index}`),
    requestedBy: adminId,
    deleteArtwork: remove,
    sync: async () => { syncs += 1; return { success: true }; },
  });
  const [firstResult, secondResult] = await Promise.all([
    startArtworkDeletionJob(first.id),
    startArtworkDeletionJob(second.id),
  ]);
  assert.equal(ARTWORK_DELETION_CONCURRENCY, 5);
  assert.equal(maximumActive, 5);
  assert.equal(new Set(calls).size, 15);
  assert.equal(firstResult.total, 8);
  assert.equal(firstResult.deleted + secondResult.deleted, 15);
  assert.equal(syncs, 2);
});

test("Stop Now is idempotent, cancels queued work, and reports active completions accurately", async () => {
  const releases = [];
  const started = [];
  const job = createArtworkDeletionJob({
    ids: Array.from({ length: 11 }, (_, index) => `art-${index}`),
    requestedBy: adminId,
    deleteArtwork: (id) => new Promise((resolve) => {
      started.push(id);
      releases.push(() => resolve({ status: "deleted" }));
    }),
    sync: async () => ({ success: true }),
  });
  const running = startArtworkDeletionJob(job.id);
  await new Promise((resolve) => setImmediate(resolve));
  const firstStop = cancelArtworkDeletionJob(job.id, adminId);
  const repeatedStop = cancelArtworkDeletionJob(job.id, adminId);
  assert.equal(firstStop.state, "stopping");
  assert.equal(repeatedStop.state, "stopping");
  assert.equal(started.length, 5);
  assert.equal(firstStop.cancelled, 6);
  releases.forEach((release) => release());
  const result = await running;
  assert.equal(result.state, "stopped");
  assert.equal(result.deleted, 5);
  assert.equal(result.cancelled, 6);
  assert.equal(result.failed, 0);
  assert.equal(result.remaining, 0);
  assert.equal(result.percentage, 100);
});

test("an immediate stop before workers start cancels everything without synchronizing", async () => {
  let started = 0;
  let syncs = 0;
  const job = createArtworkDeletionJob({
    ids: ["one", "two", "three"],
    requestedBy: adminId,
    deleteArtwork: async () => { started += 1; return { status: "deleted" }; },
    sync: async () => { syncs += 1; return { success: true }; },
  });
  cancelArtworkDeletionJob(job.id, adminId);
  const result = await startArtworkDeletionJob(job.id);
  assert.equal(started, 0);
  assert.equal(result.cancelled, 3);
  assert.equal(result.state, "stopped");
  assert.equal(syncs, 0);
});

test("failed and cancelled artwork IDs remain retryable while missing IDs are final", async () => {
  const job = createArtworkDeletionJob({
    ids: ["deleted", "failed", "missing"],
    requestedBy: adminId,
    deleteArtwork: async (id) => {
      if (id === "failed") throw Object.assign(new Error("private detail"), { publicMessage: "Cloudinary image deletion failed" });
      return { status: id === "missing" ? "missing" : "deleted" };
    },
    sync: async () => ({ success: true }),
  });
  const result = await startArtworkDeletionJob(job.id);
  assert.equal(result.deleted, 1);
  assert.equal(result.missing, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.retryIds, ["failed"]);
  assert.equal(result.items.find((item) => item.id === "failed").error, "Cloudinary image deletion failed");
  assert.doesNotMatch(JSON.stringify(result), /private detail/);
});

test("job status and cancellation are scoped to the requesting admin", () => {
  const job = createArtworkDeletionJob({ ids: ["one"], requestedBy: adminId, deleteArtwork: async () => ({ status: "deleted" }) });
  assert.equal(getArtworkDeletionJob(job.id, "another-admin"), null);
  assert.equal(cancelArtworkDeletionJob(job.id, "another-admin"), null);
  assert.equal(getArtworkDeletionJob(job.id, adminId).id, job.id);
});

test("deletion-job API routes require admin middleware and precede the artwork ID route", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../routes/artworks.js"), "utf8");
  for (const route of [
    'router.post("/deletion-jobs", protect, adminOnly',
    'router.get("/deletion-jobs/:jobId", protect, adminOnly',
    'router.post("/deletion-jobs/:jobId/cancel", protect, adminOnly',
  ]) assert.ok(source.includes(route), route);
  assert.ok(source.indexOf('router.post("/deletion-jobs"') < source.indexOf('router.delete("/:id"'));
  assert.match(source, /safeSyncPublicData\("artwork-deletion-job-finalized"\)/);
  assert.match(source, /cleanup: cleanupDeletedArtworkImages/);
});

test("Cloudinary cleanup runs only after the authoritative sync succeeds", async () => {
  const events = [];
  const successful = createArtworkDeletionJob({
    ids: ["one"],
    requestedBy: adminId,
    deleteArtwork: async () => { events.push("mongo"); return { status: "deleted", cleanup: { publicIds: ["image"] } }; },
    sync: async () => { events.push("sync"); return { success: true }; },
    cleanup: async () => { events.push("cloudinary"); },
  });
  const result = await startArtworkDeletionJob(successful.id);
  assert.deepEqual(events, ["mongo", "sync", "cloudinary"]);
  assert.equal(result.publicSync.status, "synced");

  events.length = 0;
  resetArtworkDeletionJobsForTests();
  const failed = createArtworkDeletionJob({
    ids: ["two"],
    requestedBy: adminId,
    deleteArtwork: async () => { events.push("mongo"); return { status: "deleted", cleanup: { publicIds: ["image"] } }; },
    sync: async () => { events.push("sync"); return { success: false, message: "sync failed" }; },
    cleanup: async () => { events.push("cloudinary"); },
  });
  const failedResult = await startArtworkDeletionJob(failed.id);
  assert.deepEqual(events, ["mongo", "sync"]);
  assert.equal(failedResult.publicSync.status, "failed");
  assert.equal(failedResult.cleanupPending, 1);
});

test("optional batch-history finalization is reported without hiding artwork deletion results", async () => {
  const events = [];
  const job = createArtworkDeletionJob({
    ids: ["one"],
    requestedBy: adminId,
    deleteArtwork: async () => { events.push("mongo"); return { status: "deleted" }; },
    sync: async () => { events.push("sync"); return { success: true }; },
    finalize: async (result) => {
      events.push("history");
      assert.equal(result.deleted, 1);
      return { batchCount: 1, hiddenArtworkCount: 0 };
    },
  });
  const result = await startArtworkDeletionJob(job.id);
  assert.deepEqual(events, ["mongo", "sync", "history"]);
  assert.equal(result.deleted, 1);
  assert.equal(result.historyCleanup.status, "deleted");
  assert.equal(result.historyCleanup.batchCount, 1);
});
