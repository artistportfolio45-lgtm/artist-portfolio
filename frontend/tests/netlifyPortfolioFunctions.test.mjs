import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  CURRENT_KEY,
  PORTFOLIO_STORE,
  createPublicPortfolioHandler,
  createSyncPublicPortfolioHandler,
  validateSnapshot,
} from "../netlify/functions/lib/portfolio-functions-core.mjs";

const secret = "test-only-sync-secret-with-at-least-32-characters";
const fixedNow = 1_800_000_000_000;

const snapshot = (count = 1) => {
  const artworks = Array.from({ length: count }, (_, index) => ({
    _id: `artwork-${index}`,
    title: `Artwork ${index}`,
    publicationStatus: "published",
    images: [{ url: `https://res.cloudinary.com/demo/image/upload/artwork-${index}.jpg` }],
  }));
  return {
    schemaVersion: 3,
    snapshotVersion: "a".repeat(64),
    version: "a".repeat(64),
    generatedAt: new Date(fixedNow).toISOString(),
    artworkCount: artworks.length,
    settings: { websiteTitle: "Portfolio" },
    profile: { name: "Artist" },
    about: null,
    artworks,
    categories: ["Uncategorized"],
    collections: [],
  };
};

const memoryStore = () => {
  const values = new Map();
  const reads = [];
  const writes = [];
  return {
    values,
    reads,
    writes,
    store: {
      get: async (key, options) => { reads.push({ key, options }); return values.get(key) ?? null; },
      setJSON: async (key, value, options) => { writes.push({ key, value, options }); values.set(key, value); },
    },
  };
};

const signedRequest = (payload, { timestamp = fixedNow, nonce = "12345678-1234-1234-1234-123456789012", signature } = {}) => {
  const body = JSON.stringify(payload);
  const calculated = createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
  return new Request("https://example.netlify.app/.netlify/functions/sync-public-portfolio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Public-Data-Timestamp": String(timestamp),
      "X-Public-Data-Nonce": nonce,
      "X-Public-Data-Signature": signature || `sha256=${calculated}`,
    },
    body,
  });
};

test("valid signed snapshot sync writes one complete site-wide Blob", async () => {
  const memory = memoryStore();
  const stores = [];
  const handler = createSyncPublicPortfolioHandler({
    getStore: (options) => { stores.push(options); return memory.store; },
    env: { PUBLIC_DATA_SYNC_SECRET: secret },
    now: () => fixedNow,
  });
  const response = await handler(signedRequest(snapshot()));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.artworkCount, 1);
  assert.deepEqual(stores, [{ name: PORTFOLIO_STORE, consistency: "strong" }]);
  assert.equal(memory.values.get(CURRENT_KEY).snapshotVersion, "a".repeat(64));
  assert.equal(memory.writes.filter((entry) => entry.key === CURRENT_KEY).length, 1);
});

test("invalid signatures and expired timestamps are rejected", async () => {
  const memory = memoryStore();
  const handler = createSyncPublicPortfolioHandler({ getStore: () => memory.store, env: { PUBLIC_DATA_SYNC_SECRET: secret }, now: () => fixedNow });
  const invalid = await handler(signedRequest(snapshot(), { signature: `sha256=${"0".repeat(64)}` }));
  const expired = await handler(signedRequest(snapshot(), { timestamp: fixedNow - 301_000 }));
  assert.equal(invalid.status, 401);
  assert.equal(expired.status, 401);
  assert.equal(memory.writes.length, 0);
});

test("replayed signed requests are rejected within the replay window", async () => {
  const memory = memoryStore();
  const handler = createSyncPublicPortfolioHandler({ getStore: () => memory.store, env: { PUBLIC_DATA_SYNC_SECRET: secret }, now: () => fixedNow });
  assert.equal((await handler(signedRequest(snapshot()))).status, 200);
  assert.equal((await handler(signedRequest(snapshot()))).status, 409);
  assert.equal(memory.writes.filter((entry) => entry.key === CURRENT_KEY).length, 1);
});

test("private fields and unpublished artwork are rejected", async () => {
  const privateSnapshot = snapshot();
  privateSnapshot.profile.token = "private";
  assert.match(validateSnapshot(privateSnapshot), /private or management/);
  const draftSnapshot = snapshot();
  draftSnapshot.artworks[0].publicationStatus = "draft";
  assert.match(validateSnapshot(draftSnapshot), /Only published/);
});

test("public read uses strong consistency, returns version ETag, and supports 304", async () => {
  const memory = memoryStore();
  memory.values.set(CURRENT_KEY, snapshot());
  const handler = createPublicPortfolioHandler({ getStore: () => memory.store });
  const response = await handler(new Request("https://example.netlify.app/api/public-portfolio"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), `"${"a".repeat(64)}"`);
  assert.equal((await response.json()).generatedAt, new Date(fixedNow).toISOString());
  assert.deepEqual(memory.reads[0], { key: CURRENT_KEY, options: { type: "json", consistency: "strong" } });
  const notModified = await handler(new Request("https://example.netlify.app/api/public-portfolio", {
    headers: { "If-None-Match": `"${"a".repeat(64)}"` },
  }));
  assert.equal(notModified.status, 304);
});

test("unseeded Blob returns a controlled unavailable response", async () => {
  const memory = memoryStore();
  const response = await createPublicPortfolioHandler({ getStore: () => memory.store })(new Request("https://example.netlify.app/api/public-portfolio"));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "PUBLIC_DATA_NOT_SEEDED");
});

test("approximately 900 artworks validate and store in one request", async () => {
  const memory = memoryStore();
  const payload = snapshot(900);
  assert.equal(validateSnapshot(payload), null);
  const handler = createSyncPublicPortfolioHandler({ getStore: () => memory.store, env: { PUBLIC_DATA_SYNC_SECRET: secret }, now: () => fixedNow });
  const response = await handler(signedRequest(payload));
  assert.equal(response.status, 200);
  assert.equal(memory.values.get(CURRENT_KEY).artworks.length, 900);
});

test("sync endpoint enforces method, JSON content type, body size, and artwork limit", async () => {
  const memory = memoryStore();
  const handler = createSyncPublicPortfolioHandler({ getStore: () => memory.store, env: { PUBLIC_DATA_SYNC_SECRET: secret }, now: () => fixedNow });
  const wrongMethod = await handler(new Request("https://example.netlify.app/sync", { method: "GET" }));
  const wrongType = await handler(new Request("https://example.netlify.app/sync", { method: "POST", body: "{}" }));
  const declaredTooLarge = await handler(new Request("https://example.netlify.app/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": String(5 * 1024 * 1024 + 1) },
    body: "{}",
  }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongType.status, 415);
  assert.equal(declaredTooLarge.status, 413);
  assert.equal(validateSnapshot(snapshot(2001)), "Artwork limit exceeded");
  assert.equal(memory.writes.length, 0);
});

test("function tests use only injected memory storage and non-production URLs", () => {
  assert.equal(typeof memoryStore().store.setJSON, "function");
  assert.match(signedRequest(snapshot()).url, /^https:\/\/example\.netlify\.app\//);
});
