export const BULK_DELETE_CONCURRENCY = 5;

export const BULK_DELETE_STATES = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  STOPPING: "stopping",
  STOPPED: "stopped",
  COMPLETED: "completed",
  FAILED: "failed",
});

const terminalItemStates = new Set(["deleted", "failed", "cancelled"]);

const errorMessage = (error) =>
  error?.response?.data?.message || error?.message || "Deletion failed";

export const normalizeBulkDeleteConcurrency = (value = BULK_DELETE_CONCURRENCY) => {
  const parsed = Number.parseInt(value, 10);
  return Math.min(6, Math.max(4, Number.isFinite(parsed) ? parsed : BULK_DELETE_CONCURRENCY));
};

export const createBulkArtworkDeletion = ({
  ids,
  concurrency = BULK_DELETE_CONCURRENCY,
  deleteArtwork,
  rebuild,
  refresh,
  onUpdate = () => {},
  onDeleted = () => {},
}) => {
  const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];
  const items = uniqueIds.map((id) => ({ id, status: "queued", error: "" }));
  const workerCount = normalizeBulkDeleteConcurrency(concurrency);
  let state = BULK_DELETE_STATES.IDLE;
  let stopRequested = false;
  let started = 0;
  let runPromise;
  let rebuildFailed = false;
  let refreshFailed = false;

  const snapshot = () => {
    const count = (status) => items.filter((item) => item.status === status).length;
    const deleted = count("deleted");
    const failed = count("failed");
    const cancelled = count("cancelled");
    const deleting = count("deleting");
    const queued = count("queued");
    const finished = deleted + failed + cancelled;
    const total = items.length;

    return {
      state,
      total,
      current: Math.min(started, total),
      deleted,
      failed,
      cancelled,
      deleting,
      queued,
      remaining: deleting + queued,
      percentage: total ? Math.round((finished / total) * 100) : 100,
      rebuildFailed,
      refreshFailed,
      items: items.map((item) => ({ ...item })),
      retryIds: items.filter((item) => item.status !== "deleted").map((item) => item.id),
    };
  };

  const emit = () => {
    const next = snapshot();
    onUpdate(next);
    return next;
  };

  const claimNext = () => {
    if (stopRequested || state !== BULK_DELETE_STATES.RUNNING) return null;
    const item = items.find((candidate) => candidate.status === "queued");
    if (!item) return null;
    item.status = "deleting";
    started += 1;
    emit();
    return item;
  };

  const markDeleted = (item) => {
    item.status = "deleted";
    item.error = "";
    onDeleted(item.id);
  };

  const runItem = async (item) => {
    try {
      await deleteArtwork(item.id, { signal: undefined });
      markDeleted(item);
    } catch (error) {
      item.status = "failed";
      item.error = errorMessage(error);
    } finally {
      emit();
    }
  };

  const worker = async () => {
    let item = claimNext();
    while (item) {
      await runItem(item);
      item = claimNext();
    }
  };

  const stop = () => {
    if (state !== BULK_DELETE_STATES.RUNNING && state !== BULK_DELETE_STATES.STOPPING) return snapshot();
    stopRequested = true;
    state = BULK_DELETE_STATES.STOPPING;
    items.forEach((item) => {
      if (item.status === "queued") item.status = "cancelled";
    });
    return emit();
  };

  const start = () => {
    if (runPromise) return runPromise;
    runPromise = (async () => {
      if (!items.length) {
        state = BULK_DELETE_STATES.COMPLETED;
        return emit();
      }

      state = BULK_DELETE_STATES.RUNNING;
      emit();
      await Promise.all(Array.from({ length: Math.min(workerCount, items.length) }, worker));

      const beforeFinalization = snapshot();
      state = stopRequested
        ? BULK_DELETE_STATES.STOPPED
        : beforeFinalization.failed
          ? BULK_DELETE_STATES.FAILED
          : BULK_DELETE_STATES.COMPLETED;
      emit();

      if (snapshot().deleted && rebuild) {
        try {
          await rebuild();
        } catch {
          rebuildFailed = true;
          if (!stopRequested) state = BULK_DELETE_STATES.FAILED;
          emit();
        }
      }

      if (refresh) {
        try {
          await refresh();
        } catch {
          refreshFailed = true;
          if (!stopRequested) state = BULK_DELETE_STATES.FAILED;
          emit();
        }
      }

      return emit();
    })();
    return runPromise;
  };

  return { start, stop, getSnapshot: snapshot };
};

export const isBulkDeleteTerminal = (status) => terminalItemStates.has(status);
