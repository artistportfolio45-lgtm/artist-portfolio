const test = require("node:test");
const assert = require("node:assert/strict");

const originalFetch = global.fetch;
const originalHookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
const originalDebounceMs = process.env.STATIC_REBUILD_DEBOUNCE_MS;

test("coalesces rapid rebuild requests into a single Netlify call", async () => {
  process.env.NETLIFY_BUILD_HOOK_URL = "https://example.com/rebuild";
  process.env.STATIC_REBUILD_DEBOUNCE_MS = "20";

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  };

  delete require.cache[require.resolve("../utils/staticRebuild")];
  const { triggerStaticRebuild } = require("../utils/staticRebuild");

  const first = triggerStaticRebuild("bulk-upload-start");
  const second = triggerStaticRebuild("bulk-upload-finish");

  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(calls.length, 1);
  assert.equal(firstResult.triggered, true);
  assert.equal(secondResult.triggered, true);
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
