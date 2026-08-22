const PUBLIC_SYNC_WARNING = "Artwork changes were saved, but public Gallery synchronization failed.";

let failure = null;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener(failure));

export const reportPublicSyncFailure = (message = PUBLIC_SYNC_WARNING) => {
  failure = { message: message || PUBLIC_SYNC_WARNING, reportedAt: new Date().toISOString() };
  emit();
};

export const clearPublicSyncFailure = () => {
  if (!failure) return;
  failure = null;
  emit();
};

export const inspectPublicSyncPayload = (payload) => {
  const publicSync = payload?.publicSync || payload?.job?.publicSync;
  if (!publicSync) return;
  if (publicSync.success === false || publicSync.status === "failed") {
    reportPublicSyncFailure(publicSync.message || PUBLIC_SYNC_WARNING);
  } else if (publicSync.success === true || publicSync.status === "synced") {
    clearPublicSyncFailure();
  }
};

export const subscribeToPublicSyncFailure = (listener) => {
  listeners.add(listener);
  listener(failure);
  return () => listeners.delete(listener);
};

export { PUBLIC_SYNC_WARNING };

