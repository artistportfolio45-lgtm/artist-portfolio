const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = (name) => fs.readFileSync(path.join(__dirname, "..", "routes", name), "utf8");

test("state-changing admin routes require the admin authorization middleware", () => {
  const checks = [
    ["artworks.js", 'router.put("/:id", protect, adminOnly'],
    ["artworks.js", 'router.delete("/:id/images/:publicId", protect, adminOnly'],
    ["artworks.js", 'router.post("/deletion-jobs", protect, adminOnly'],
    ["artworks.js", 'router.get("/deletion-jobs/:jobId", protect, adminOnly'],
    ["artworks.js", 'router.post("/deletion-jobs/:jobId/cancel", protect, adminOnly'],
    ["profile.js", 'router.put("/", protect, adminOnly'],
    ["settings.js", 'router.put("/", protect, adminOnly'],
    ["settings.js", 'router.put("/home", protect, adminOnly'],
    ["settings.js", 'router.put("/home/background", protect, adminOnly'],
    ["inquiries.js", 'router.delete("/:id", protect, adminOnly'],
    ["activity.js", 'router.get("/", protect, adminOnly'],
  ];
  for (const [file, marker] of checks) assert.ok(source(file).includes(marker), `${file}: ${marker}`);
});

test("health response does not disclose deployment environment", () => {
  assert.doesNotMatch(source("../server.js"), /env:\s*process\.env\.NODE_ENV/);
});

test("security headers allow only same-origin framing", () => {
  const server = source("../server.js");
  assert.match(server, /frameAncestors:\s*\["'self'"\]/);
  assert.match(server, /frameguard:\s*\{ action: "sameorigin" \}/);
  assert.doesNotMatch(server, /frameAncestors:\s*\["(?:\*|'none')"\]/);
});

test("CORS recognizes the production and local frontend origins", () => {
  const server = source("../server.js");
  assert.match(server, /https:\/\/artistportfolio46\.netlify\.app/);
  assert.match(server, /http:\/\/localhost:5173/);
  assert.doesNotMatch(server, /https:\/\/artistportfolio45\.netlify\.app/);
});
