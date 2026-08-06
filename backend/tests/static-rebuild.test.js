const test = require("node:test");
const assert = require("node:assert/strict");

const originalFetch = global.fetch;
const originalHookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
const originalDebounceMs = process.env.STATIC_REBUILD_DEBOUNCE_MS;

test("coalesces automatic rebuild requests and flushes the final reason once", async () => {
  process.env.NETLIFY_BUILD_HOOK_URL = "https://example.com/rebuild";
  process.env.STATIC_REBUILD_DEBOUNCE_MS = "20";

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  };

  delete require.cache[require.resolve("../utils/staticRebuild")];
  const { triggerStaticRebuild, flushStaticRebuild, resetStaticRebuildForTests } = require("../utils/staticRebuild");

  const firstResult = await triggerStaticRebuild("bulk-upload-start");
  const secondResult = await triggerStaticRebuild("bulk-upload-finish");

  assert.equal(calls.length, 0);
  assert.deepEqual(firstResult, { triggered: true, scheduled: true });
  assert.deepEqual(secondResult, { triggered: true, scheduled: true });

  const flushResult = await flushStaticRebuild();
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).trigger, "bulk-upload-finish");
  assert.equal(flushResult.triggered, true);
  resetStaticRebuildForTests();
});

test("a final flush waits for an in-flight build and then starts a new build", async () => {
  process.env.NETLIFY_BUILD_HOOK_URL = "https://example.com/rebuild";
  const resolvers = [];
  const calls = [];
  global.fetch = async (url, options) => new Promise((resolve) => {
    calls.push({ url, options });
    resolvers.push(() => resolve({ ok: true, status: 200 }));
  });

  delete require.cache[require.resolve("../utils/staticRebuild")];
  const { flushStaticRebuild, resetStaticRebuildForTests } = require("../utils/staticRebuild");
  const first = flushStaticRebuild("earlier-change");
  await new Promise((resolve) => setImmediate(resolve));
  const final = flushStaticRebuild("bulk-upload-completed");
  assert.equal(calls.length, 1);
  resolvers.shift()();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).trigger, "bulk-upload-completed");
  resolvers.shift()();
  assert.equal((await final).triggered, true);
  resetStaticRebuildForTests();
});

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalHookUrl === undefined) {
    delete process.env.NETLIFY_BUILD_HOOK_URL;
  } else {
    process.env.NETLIFY_BUILD_HOOK_URL = originalHookUrl;
  }

  if (originalDebounceMs === undefined) {
    delete process.env.STATIC_REBUILD_DEBOUNCE_MS;
  } else {
    process.env.STATIC_REBUILD_DEBOUNCE_MS = originalDebounceMs;
  }

  delete require.cache[require.resolve("../utils/staticRebuild")];
});
