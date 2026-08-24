const crypto = require("crypto");
const { buildPublicSnapshot } = require("./publicSnapshot");

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_DELAYS_MS = [250, 750];
const PUBLIC_SYNC_WARNING = "Artwork changes were saved, but public Gallery synchronization failed.";

let syncQueue = Promise.resolve();

const wait = (milliseconds) => new Promise((resolve) => {
  const timer = setTimeout(resolve, milliseconds);
  timer.unref?.();
});

const safeFailure = (message, attempts = 0) => ({
  success: false,
  message: PUBLIC_SYNC_WARNING,
  detail: message,
  attempts,
});

const validateConfiguration = () => {
  const url = String(process.env.PUBLIC_DATA_SYNC_URL || "").trim();
  const secret = String(process.env.PUBLIC_DATA_SYNC_SECRET || "");
  if (!url) return { error: "Public sync URL is not configured" };
  if (secret.length < 32) return { error: "Public sync secret is not configured securely" };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      return { error: "Public sync URL must use HTTPS" };
    }
    if (!/\/.netlify\/functions\/sync-public-portfolio\/?$/.test(parsed.pathname)) {
      return { error: "Public sync URL must target the Netlify sync-public-portfolio function" };
    }
  } catch {
    return { error: "Public sync URL is invalid" };
  }
  return { url, secret };
};

const signedHeaders = ({ body, secret, now = Date.now, randomUUID = crypto.randomUUID }) => {
  const timestamp = String(now());
  const nonce = randomUUID();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex");
  return {
    "Content-Type": "application/json",
    "X-Public-Data-Timestamp": timestamp,
    "X-Public-Data-Nonce": nonce,
    "X-Public-Data-Signature": `sha256=${signature}`,
  };
};

const performPublicDataSync = async ({
  reason = "public-content-updated",
  fetchImpl = global.fetch,
  buildSnapshot = buildPublicSnapshot,
  sleep = wait,
  now = Date.now,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
} = {}) => {
  const configuration = validateConfiguration();
  if (configuration.error) {
    const localDevelopment = process.env.NODE_ENV !== "production"
      && !String(process.env.PUBLIC_DATA_SYNC_URL || "").trim()
      && !String(process.env.PUBLIC_DATA_SYNC_SECRET || "");
    if (localDevelopment) {
      return {
        success: true,
        localOnly: true,
        message: "Local development uses the live backend public-data fallback; external Netlify Blob sync was skipped.",
        attempts: 0,
      };
    }
    return safeFailure(configuration.error);
  }
  if (typeof fetchImpl !== "function") return safeFailure("Fetch is unavailable");

  let snapshot;
  try {
    snapshot = await buildSnapshot();
  } catch (error) {
    console.error("[public-data-sync] snapshot generation failed", { reason, name: error?.name });
    return safeFailure("Snapshot generation failed");
  }
  const body = JSON.stringify(snapshot);
  let lastDetail = "Public sync request failed";
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    timeout.unref?.();
    try {
      const response = await fetchImpl(configuration.url, {
        method: "POST",
        headers: signedHeaders({ body, secret: configuration.secret, now }),
        body,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.success !== false) {
        return {
          success: true,
          version: payload.version || snapshot.snapshotVersion,
          snapshotVersion: payload.snapshotVersion || payload.version || snapshot.snapshotVersion,
          generatedAt: payload.generatedAt || snapshot.generatedAt,
          artworkCount: Number(payload.artworkCount ?? snapshot.artworkCount),
          attempts: attempt,
        };
      }
      lastDetail = `Sync endpoint returned HTTP ${response.status}${payload?.message ? `: ${String(payload.message).slice(0, 160)}` : ""}`;
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) break;
    } catch (error) {
      lastDetail = error?.name === "AbortError" ? "Sync request timed out" : "Sync request could not be completed";
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1]);
  }

  console.error("[public-data-sync] synchronization failed", { reason, detail: lastDetail });
  return safeFailure(lastDetail, attempts);
};

const syncPublicData = (reason, options = {}) => {
  const run = () => performPublicDataSync({ ...options, reason });
  const queued = syncQueue.then(run, run);
  syncQueue = queued.then(() => undefined, () => undefined);
  return queued;
};

const resetPublicDataSyncForTests = () => {
  syncQueue = Promise.resolve();
};

module.exports = {
  MAX_ATTEMPTS,
  PUBLIC_SYNC_WARNING,
  performPublicDataSync,
  resetPublicDataSyncForTests,
  signedHeaders,
  syncPublicData,
  validateConfiguration,
};
