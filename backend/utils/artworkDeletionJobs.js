const crypto = require("crypto");

const ARTWORK_DELETION_CONCURRENCY = 5;
const JOB_RETENTION_MS = 60 * 60 * 1000;
const jobs = new Map();
const activeArtworkIds = new Set();
const semaphoreWaiters = [];
let globallyDeleting = 0;

const terminalJobStates = new Set(["stopped", "completed", "completed_with_errors"]);
const terminalItemStates = new Set(["deleted", "missing", "failed", "cancelled"]);

const acquireDeletionSlot = () => new Promise((resolve) => {
  if (globallyDeleting < ARTWORK_DELETION_CONCURRENCY) {
    globallyDeleting += 1;
    resolve();
    return;
  }
  semaphoreWaiters.push(resolve);
});

const releaseDeletionSlot = () => {
  const next = semaphoreWaiters.shift();
  if (next) next();
  else globallyDeleting = Math.max(0, globallyDeleting - 1);
};

const publicJob = (job) => {
  const count = (status) => job.items.filter((item) => item.status === status).length;
  const deleted = count("deleted");
  const missing = count("missing");
  const failed = count("failed");
  const cancelled = count("cancelled");
  const deleting = count("deleting");
  const queued = count("queued");
  const finished = deleted + missing + failed + cancelled;
  return {
    id: job.id,
    state: job.state,
    total: job.items.length,
    current: job.started,
    deleted,
    missing,
    failed,
    cancelled,
    deleting,
    queued,
    remaining: deleting + queued,
    percentage: job.items.length ? Math.round((finished / job.items.length) * 100) : 100,
    rebuild: { ...job.rebuild },
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    items: job.items.map(({ id, status, error }) => ({ id, status, error })),
    retryIds: job.items.filter((item) => ["failed", "cancelled"].includes(item.status)).map((item) => item.id),
  };
};

const scheduleCleanup = (jobId) => {
  const timer = setTimeout(() => jobs.delete(jobId), JOB_RETENTION_MS);
  timer.unref?.();
};

const createArtworkDeletionJob = ({ ids, requestedBy, deleteArtwork, rebuild }) => {
  const uniqueIds = [...new Set(ids.map(String))];
  const job = {
    id: crypto.randomUUID(),
    requestedBy: String(requestedBy || ""),
    state: "queued",
    cancelRequested: false,
    started: 0,
    items: uniqueIds.map((id) => ({ id, status: "queued", error: "" })),
    rebuild: { status: "pending", message: "" },
    createdAt: new Date().toISOString(),
    finishedAt: null,
    runPromise: null,
  };
  // Keep callbacks separate from the public rebuild result.
  job.runDelete = deleteArtwork;
  job.runRebuild = rebuild;
  jobs.set(job.id, job);
  return publicJob(job);
};

const claimNext = (job) => {
  if (job.cancelRequested || job.state !== "running") return null;
  const item = job.items.find((candidate) => candidate.status === "queued");
  if (!item) return null;
  item.status = "deleting";
  job.started += 1;
  return item;
};

const runItem = async (job, item) => {
  if (activeArtworkIds.has(item.id)) {
    item.status = "failed";
    item.error = "Artwork is already being processed by another deletion job";
    return;
  }
  activeArtworkIds.add(item.id);
  try {
    const result = await job.runDelete(item.id);
    item.status = result?.status === "missing" ? "missing" : "deleted";
  } catch (error) {
    item.status = "failed";
    item.error = error?.publicMessage || "Artwork deletion failed";
  } finally {
    activeArtworkIds.delete(item.id);
  }
};

const worker = async (job) => {
  while (true) {
    await acquireDeletionSlot();
    const item = claimNext(job);
    if (!item) {
      releaseDeletionSlot();
      return;
    }
    try {
      await runItem(job, item);
    } finally {
      releaseDeletionSlot();
    }
  }
};

const finalizeJob = async (job) => {
  job.items.forEach((item) => {
    if (item.status === "queued") item.status = job.cancelRequested ? "cancelled" : "failed";
  });
  const beforeRebuild = publicJob(job);
  const finalState = job.cancelRequested
    ? "stopped"
    : beforeRebuild.failed
      ? "completed_with_errors"
      : "completed";
  job.state = "finalizing";

  if (beforeRebuild.deleted > 0 && job.runRebuild) {
    job.rebuild = { status: "running", message: "" };
    try {
      const outcome = await job.runRebuild();
      job.rebuild = outcome?.triggered === false
        ? { status: "failed", message: outcome.message || "Public rebuild was not scheduled" }
        : { status: "scheduled", message: "" };
    } catch {
      job.rebuild = { status: "failed", message: "Public rebuild was not scheduled" };
    }
  } else {
    job.rebuild = { status: "not_needed", message: "" };
  }
  job.state = finalState;
  job.finishedAt = new Date().toISOString();
  scheduleCleanup(job.id);
  return publicJob(job);
};

const startArtworkDeletionJob = (jobId) => {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (job.runPromise) return job.runPromise;
  job.runPromise = (async () => {
    if (job.cancelRequested) return finalizeJob(job);
    job.state = "running";
    await Promise.all(Array.from({ length: Math.min(ARTWORK_DELETION_CONCURRENCY, job.items.length) }, () => worker(job)));
    return finalizeJob(job);
  })();
  return job.runPromise;
};

const getArtworkDeletionJob = (jobId, requestedBy) => {
  const job = jobs.get(jobId);
  if (!job || job.requestedBy !== String(requestedBy || "")) return null;
  return publicJob(job);
};

const cancelArtworkDeletionJob = (jobId, requestedBy) => {
  const job = jobs.get(jobId);
  if (!job || job.requestedBy !== String(requestedBy || "")) return null;
  if (terminalJobStates.has(job.state) || job.state === "finalizing") return publicJob(job);
  job.cancelRequested = true;
  job.state = "stopping";
  job.items.forEach((item) => {
    if (item.status === "queued") item.status = "cancelled";
  });
  return publicJob(job);
};

const resetArtworkDeletionJobsForTests = () => {
  jobs.clear();
  activeArtworkIds.clear();
  semaphoreWaiters.splice(0);
  globallyDeleting = 0;
};

module.exports = {
  ARTWORK_DELETION_CONCURRENCY,
  cancelArtworkDeletionJob,
  createArtworkDeletionJob,
  getArtworkDeletionJob,
  resetArtworkDeletionJobsForTests,
  startArtworkDeletionJob,
  terminalItemStates,
  terminalJobStates,
};
