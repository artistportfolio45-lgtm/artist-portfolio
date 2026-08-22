const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  MAX_ATTEMPTS,
  performPublicDataSync,
  signedHeaders,
} = require("../utils/publicDataSync");

const originalUrl = process.env.PUBLIC_DATA_SYNC_URL;
const originalSecret = process.env.PUBLIC_DATA_SYNC_SECRET;
const secret = "test-only-sync-secret-with-at-least-32-characters";
const fixture = {
  schemaVersion: 3,
  snapshotVersion: "b".repeat(64),
  version: "b".repeat(64),
  generatedAt: "2026-08-22T00:00:00.000Z",
  artworkCount: 0,
  settings: {}, profile: {}, about: null, artworks: [], categories: [], collections: [],
};

test.beforeEach(() => {
  process.env.PUBLIC_DATA_SYNC_URL = "https://example.netlify.app/.netlify/functions/sync-public-portfolio";
  process.env.PUBLIC_DATA_SYNC_SECRET = secret;
});

test.after(() => {
  if (originalUrl === undefined) delete process.env.PUBLIC_DATA_SYNC_URL;
  else process.env.PUBLIC_DATA_SYNC_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.PUBLIC_DATA_SYNC_SECRET;
  else process.env.PUBLIC_DATA_SYNC_SECRET = originalSecret;
});

test("backend signs timestamp, nonce and exact request body with HMAC-SHA256", () => {
  const body = JSON.stringify(fixture);
  const headers = signedHeaders({ body, secret, now: () => 123, randomUUID: () => "nonce-1234567890" });
  const expected = crypto.createHmac("sha256", secret).update(`123.nonce-1234567890.${body}`).digest("hex");
  assert.equal(headers["X-Public-Data-Signature"], `sha256=${expected}`);
});

test("backend retries at most three times with the identical idempotent snapshot", async () => {
  const bodies = [];
  const delays = [];
  let calls = 0;
  const result = await performPublicDataSync({
    buildSnapshot: async () => fixture,
    sleep: async (delay) => { delays.push(delay); },
    fetchImpl: async (_url, options) => {
      calls += 1;
      bodies.push(options.body);
      return { ok: calls === MAX_ATTEMPTS, status: calls === MAX_ATTEMPTS ? 200 : 503, json: async () => calls === MAX_ATTEMPTS ? { success: true } : {} };
    },
  });
  assert.equal(result.success, true);
  assert.equal(calls, 3);
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(delays, [250, 750]);
});

test("backend returns the exact admin warning and never loops indefinitely", async () => {
  let calls = 0;
  const result = await performPublicDataSync({
    buildSnapshot: async () => fixture,
    sleep: async () => {},
    fetchImpl: async () => { calls += 1; return { ok: false, status: 503, json: async () => ({}) }; },
  });
  assert.equal(calls, MAX_ATTEMPTS);
  assert.equal(result.success, false);
  assert.equal(result.message, "Artwork changes were saved, but public Gallery synchronization failed.");
});

