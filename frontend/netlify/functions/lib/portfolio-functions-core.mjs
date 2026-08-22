import { createHmac, timingSafeEqual } from "node:crypto";

export const PORTFOLIO_STORE = "portfolio-public-data";
export const CURRENT_KEY = "current";
export const REPLAY_KEY = "_recent-sync-signatures";
export const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const MAX_ARTWORKS = 2000;
export const REPLAY_WINDOW_MS = 5 * 60 * 1000;

const FORBIDDEN_FIELDS = new Set([
  "password", "passwordhash", "jwt", "token", "otp", "otpcode", "otphash",
  "recoverycode", "recoverycodes", "secret", "apisecret", "publicid",
  "logopublicid", "profilephotopublicid", "mongodburi", "updatedby", "activitylog",
  "inquiries", "admincredentials", "sourcenote", "draft", "clientuploadid", "uploadbatchid",
  "uploadedby", "uploadstatus", "__v",
]);

const jsonResponse = (payload, status = 200, headers = {}) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
});

const responseHeaders = (snapshot) => ({
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  ETag: `"${snapshot.snapshotVersion}"`,
  "X-Content-Type-Options": "nosniff",
});

const privateFieldPath = (value, path = "snapshot") => {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = privateFieldPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key.toLowerCase())) return `${path}.${key}`;
    const found = privateFieldPath(entry, `${path}.${key}`);
    if (found) return found;
  }
  return null;
};

const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

export const validateSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "Snapshot must be an object";
  if (snapshot.schemaVersion !== 3) return "Unsupported snapshot schema";
  if (!/^[a-f0-9]{64}$/.test(String(snapshot.snapshotVersion || ""))) return "Invalid snapshot version";
  if (snapshot.version !== snapshot.snapshotVersion) return "Snapshot versions do not match";
  if (Number.isNaN(Date.parse(snapshot.generatedAt))) return "Invalid generation timestamp";
  if (!Array.isArray(snapshot.artworks)) return "Artworks must be an array";
  if (snapshot.artworks.length > MAX_ARTWORKS) return "Artwork limit exceeded";
  if (snapshot.artworkCount !== snapshot.artworks.length) return "Artwork count does not match";
  if (!Array.isArray(snapshot.categories) || !Array.isArray(snapshot.collections)) return "Categories and collections must be arrays";
  if (!snapshot.settings || typeof snapshot.settings !== "object") return "Public settings are required";
  if (!snapshot.profile || typeof snapshot.profile !== "object") return "Public profile is required";
  const forbidden = privateFieldPath(snapshot);
  if (forbidden) return "Snapshot contains a private or management field";

  const ids = new Set();
  for (const artwork of snapshot.artworks) {
    if (!artwork || typeof artwork !== "object" || !String(artwork._id || "").trim()) return "Every artwork requires an ID";
    if (ids.has(String(artwork._id))) return "Artwork IDs must be unique";
    ids.add(String(artwork._id));
    if (artwork.publicationStatus !== "published") return "Only published artworks are accepted";
    if (!Array.isArray(artwork.images) || artwork.images.length === 0 || artwork.images.some((image) => !image?.url || !isHttpsUrl(image.url))) {
      return "Artwork images must use HTTPS URLs";
    }
  }
  return null;
};

const signaturesMatch = (provided, expected) => {
  const normalized = String(provided || "").replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;
  const first = Buffer.from(normalized, "hex");
  const second = Buffer.from(expected, "hex");
  return first.length === second.length && timingSafeEqual(first, second);
};

export const createPublicPortfolioHandler = ({ getStore }) => async (request) => {
  if (request.method !== "GET") {
    return jsonResponse({ success: false, message: "Method not allowed" }, 405, { Allow: "GET" });
  }
  try {
    const store = getStore({ name: PORTFOLIO_STORE, consistency: "strong" });
    const snapshot = await store.get(CURRENT_KEY, { type: "json", consistency: "strong" });
    if (!snapshot) {
      return jsonResponse({
        success: false,
        code: "PUBLIC_DATA_NOT_SEEDED",
        message: "Public portfolio data is not available yet.",
      }, 503, { "Cache-Control": "no-store" });
    }
    const headers = responseHeaders(snapshot);
    if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
    return jsonResponse(snapshot, 200, headers);
  } catch (error) {
    console.error("[public-portfolio] Blob read failed", { name: error?.name });
    return jsonResponse({
      success: false,
      code: "PUBLIC_DATA_UNAVAILABLE",
      message: "Public portfolio data is temporarily unavailable.",
    }, 503, { "Cache-Control": "no-store" });
  }
};

export const createSyncPublicPortfolioHandler = ({ getStore, env = process.env, now = Date.now }) => async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ success: false, message: "Method not allowed" }, 405, { Allow: "POST", "Cache-Control": "no-store" });
  }
  if (!String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return jsonResponse({ success: false, message: "Content-Type must be application/json" }, 415, { "Cache-Control": "no-store" });
  }
  const configuredSecret = String(env.PUBLIC_DATA_SYNC_SECRET || "");
  if (configuredSecret.length < 32) {
    console.error("[sync-public-portfolio] Sync secret is not configured securely");
    return jsonResponse({ success: false, message: "Synchronization is unavailable" }, 503, { "Cache-Control": "no-store" });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return jsonResponse({ success: false, message: "Snapshot is too large" }, 413, { "Cache-Control": "no-store" });

  const timestampValue = request.headers.get("x-public-data-timestamp");
  const nonce = String(request.headers.get("x-public-data-nonce") || "");
  const timestamp = Number(timestampValue);
  if (!Number.isFinite(timestamp) || Math.abs(now() - timestamp) > REPLAY_WINDOW_MS) {
    return jsonResponse({ success: false, message: "Request timestamp is invalid or expired" }, 401, { "Cache-Control": "no-store" });
  }
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(nonce)) {
    return jsonResponse({ success: false, message: "Request nonce is invalid" }, 401, { "Cache-Control": "no-store" });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ success: false, message: "Snapshot is too large" }, 413, { "Cache-Control": "no-store" });
  }
  const expected = createHmac("sha256", configuredSecret)
    .update(`${timestampValue}.${nonce}.${body}`)
    .digest("hex");
  const provided = request.headers.get("x-public-data-signature");
  if (!signaturesMatch(provided, expected)) {
    return jsonResponse({ success: false, message: "Authentication failed" }, 401, { "Cache-Control": "no-store" });
  }

  let snapshot;
  try {
    snapshot = JSON.parse(body);
  } catch {
    return jsonResponse({ success: false, message: "Request body must contain valid JSON" }, 400, { "Cache-Control": "no-store" });
  }
  const validationError = validateSnapshot(snapshot);
  if (validationError) return jsonResponse({ success: false, message: validationError }, 400, { "Cache-Control": "no-store" });

  try {
    const store = getStore({ name: PORTFOLIO_STORE, consistency: "strong" });
    const replayState = await store.get(REPLAY_KEY, { type: "json", consistency: "strong" }) || { entries: [] };
    const replayId = createHmac("sha256", configuredSecret).update(`${timestampValue}.${nonce}.${provided}`).digest("hex");
    const recentEntries = (Array.isArray(replayState.entries) ? replayState.entries : [])
      .filter((entry) => Number(entry?.expiresAt) > now());
    if (recentEntries.some((entry) => entry.id === replayId)) {
      return jsonResponse({ success: false, message: "Request has already been processed" }, 409, { "Cache-Control": "no-store" });
    }
    recentEntries.push({ id: replayId, expiresAt: now() + REPLAY_WINDOW_MS });
    await store.setJSON(REPLAY_KEY, { entries: recentEntries.slice(-100) });
    await store.setJSON(CURRENT_KEY, snapshot, {
      metadata: { snapshotVersion: snapshot.snapshotVersion, generatedAt: snapshot.generatedAt },
    });
    return jsonResponse({
      success: true,
      version: snapshot.snapshotVersion,
      snapshotVersion: snapshot.snapshotVersion,
      artworkCount: snapshot.artworkCount,
      generatedAt: snapshot.generatedAt,
    }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("[sync-public-portfolio] Blob write failed", { name: error?.name });
    return jsonResponse({ success: false, message: "Snapshot could not be stored" }, 503, { "Cache-Control": "no-store" });
  }
};
