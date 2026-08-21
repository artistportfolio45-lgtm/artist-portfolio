const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ActivityLog = require("../models/ActivityLog");
const Artwork = require("../models/Artwork");
const Inquiry = require("../models/Inquiry");
const inquiryRouter = require("../routes/inquiries");
const {
  MAX_BULK_INQUIRIES,
  buildInquiryFilter,
  chunkInquiryIds,
  normalizeInquiryIds,
  validateInquiryFilters,
} = require("../utils/inquiryManagement");

const routes = fs.readFileSync(path.resolve(__dirname, "../routes/inquiries.js"), "utf8");
const model = fs.readFileSync(path.resolve(__dirname, "../models/Inquiry.js"), "utf8");
const managementSource = fs.readFileSync(path.resolve(__dirname, "../utils/inquiryManagement.js"), "utf8");
const validIds = ["507f1f77bcf86cd799439011", "507f191e810c19729de860ea"];

const routeLayer = (method, routePath) => inquiryRouter.stack.find((layer) => (
  layer.route?.path === routePath && layer.route.methods[method]
));

const invokeRoute = async (method, routePath, request = {}) => {
  const layer = routeLayer(method, routePath);
  assert.ok(layer, `${method.toUpperCase()} ${routePath} route should exist`);
  const req = {
    body: {}, params: {}, query: {}, headers: {}, socket: {},
    user: { _id: validIds[1], role: "admin" },
    ...request,
  };
  const response = { statusCode: 200, payload: null };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(payload) { response.payload = payload; return this; },
  };
  await layer.route.stack[layer.route.stack.length - 1].handle(req, res, () => {});
  return response;
};

const queryResult = (value) => ({
  select() { return this; },
  lean: async () => value,
});

const withModelMocks = async (overrides, callback) => {
  const targets = { Inquiry, Artwork, ActivityLog };
  const originals = [];
  for (const [qualifiedName, replacement] of Object.entries(overrides)) {
    const [modelName, method] = qualifiedName.split(".");
    originals.push([targets[modelName], method, targets[modelName][method]]);
    targets[modelName][method] = replacement;
  }
  const activityWasMocked = Object.hasOwn(overrides, "ActivityLog.create");
  if (!activityWasMocked) {
    originals.push([ActivityLog, "create", ActivityLog.create]);
    ActivityLog.create = async () => ({});
  }
  try {
    return await callback();
  } finally {
    for (const [target, method, original] of originals.reverse()) target[method] = original;
  }
};

test("inquiry filters are bounded, escaped and cover all management fields", () => {
  const query = buildInquiryFilter({ search: ".* test", inquiryType: "artwork", isRead: "false", isResolved: "false", dateFrom: "2026-01-01", dateTo: "2026-01-31" });
  assert.equal(query.deletedAt, null);
  assert.equal(query.inquiryType, "artwork");
  assert.equal(query.isRead, false);
  assert.deepEqual(query.isResolved, { $ne: true });
  assert.deepEqual(query.$or.map((entry) => Object.keys(entry)[0]), ["name", "email", "subject", "message", "artworkTitle"]);
  assert.equal(query.$or[0].name.$regex, "\\.\\* test");
  assert.ok(query.createdAt.$gte instanceof Date);
  assert.ok(query.createdAt.$lte instanceof Date);
  assert.deepEqual(buildInquiryFilter({}, { trash: true }).deletedAt, { $ne: null });
});

test("destructive filtered actions reject malformed or ambiguous filters", () => {
  assert.equal(validateInquiryFilters({ inquiryType: "everything" }), "Invalid inquiry type filter");
  assert.equal(validateInquiryFilters({ isRead: "maybe" }), "Invalid isRead filter");
  assert.equal(validateInquiryFilters({ isResolved: "maybe" }), "Invalid isResolved filter");
  assert.equal(validateInquiryFilters({ dateFrom: "not-a-date" }), "Invalid start date filter");
  assert.equal(validateInquiryFilters({ dateFrom: "2026-02-10", dateTo: "2026-01-01" }), "Start date must be before end date");
  assert.equal(validateInquiryFilters({ inquiryType: "contact", isRead: "true" }), "");
});

test("bulk IDs are validated, deduplicated, bounded and chunked", () => {
  assert.equal(normalizeInquiryIds([]).error, "Select at least one inquiry");
  assert.match(normalizeInquiryIds(["bad-id"]).error, /invalid/);
  assert.deepEqual(normalizeInquiryIds([validIds[0], validIds[0], validIds[1]]).ids, validIds);
  assert.deepEqual(normalizeInquiryIds(Array(MAX_BULK_INQUIRIES + 1).fill(validIds[0])).ids, [validIds[0]]);
  const tooManyUniqueIds = Array.from({ length: MAX_BULK_INQUIRIES + 1 }, (_, index) => index.toString(16).padStart(24, "0"));
  assert.match(normalizeInquiryIds(tooManyUniqueIds).error, /maximum/i);
  assert.deepEqual(chunkInquiryIds([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("Inquiry supports recoverable Trash and resolution state without artwork cascades", () => {
  for (const field of ["isResolved", "deletedAt", "deletedBy"]) assert.ok(model.includes(field), field);
  for (const index of ["deletedAt: 1, createdAt", "deletedAt: 1, isRead", "deletedAt: 1, isResolved", "deletedAt: 1, inquiryType"]) assert.ok(model.includes(index), index);
  const adminRoutes = routes.slice(routes.indexOf("// Fixed admin routes"));
  assert.doesNotMatch(adminRoutes, /Artwork\.(delete|findByIdAndDelete|update|findOneAndDelete)/);
  assert.doesNotMatch(adminRoutes, /cloudinary|destroyImage|deleteImage/i);
});

test("all Trash endpoints require admin authorization and precede dynamic routes", () => {
  const endpoints = [
    'router.post("/bulk/trash", protect, adminOnly',
    'router.post("/filtered/trash", protect, adminOnly',
    'router.post("/bulk/restore", protect, adminOnly',
    'router.post("/filtered/restore", protect, adminOnly',
    'router.delete("/bulk/permanent", protect, adminOnly',
    'router.delete("/filtered/permanent", protect, adminOnly',
    'router.delete("/trash/empty", protect, adminOnly',
    'router.patch("/:id/trash", protect, adminOnly',
    'router.patch("/:id/restore", protect, adminOnly',
    'router.delete("/:id/permanent", protect, adminOnly',
  ];
  endpoints.forEach((endpoint) => assert.ok(routes.includes(endpoint), endpoint));
  assert.ok(routes.indexOf('router.post("/bulk/trash"') < routes.indexOf('router.get("/:id"'));
  assert.match(routes, /req\.body\?\.confirmation !== "DELETE"/);
  assert.match(routes, /req\.body\?\.confirm !== true/);
});

test("bulk actions report affected, missing, unchanged and failed counts idempotently", () => {
  for (const field of ["requested", "affected", "deleted", "alreadyMissing", "unchanged", "failed"]) assert.ok(routes.includes(field), field);
  assert.match(managementSource, /new Set\(value\.map/);
  assert.match(routes, /for \(const ids of chunkInquiryIds/);
  assert.match(routes, /deletedAt: \{ \$ne: null \}/);
  assert.match(routes, /deletedAt: null/);
});

test("activity records contain action status and counts but no inquiry content", () => {
  for (const action of ["Inquiry moved to Trash", "Inquiry restored", "Inquiry permanently deleted", "Inquiry Trash emptied"]) assert.ok(routes.includes(action), action);
  assert.match(routes, /metadata: \{\s*status:/);
  assert.doesNotMatch(routes, /metadata:\s*\{[^}]*\b(message|phone|email)\b/s);
});

test("public Contact and Artwork Enquiry intake remains registered", () => {
  assert.match(routes, /router\.post\("\/", async \(req, res\)/);
  assert.match(routes, /inquiryType: inquiryType === "artwork" \|\| artworkRef \? "artwork" : "contact"/);
  assert.match(routes, /await Inquiry\.create/);
});

test("individual Trash, restore and permanent-delete routes execute the safe lifecycle", async () => {
  let state = "active";
  await withModelMocks({
    "Inquiry.find": () => queryResult([{ _id: validIds[0], deletedAt: state === "active" ? null : new Date("2026-01-01") }]),
    "Inquiry.updateMany": async (filter, update) => {
      state = update.$set.deletedAt === null ? "trash-restored" : "trashed";
      return { modifiedCount: 1 };
    },
    "Inquiry.deleteMany": async () => { state = "deleted"; return { deletedCount: 1 }; },
    "Inquiry.countDocuments": async () => 0,
  }, async () => {
    const trashed = await invokeRoute("patch", "/:id/trash", { params: { id: validIds[0] } });
    assert.equal(trashed.statusCode, 200);
    assert.equal(trashed.payload.result.affected, 1);
    assert.equal(state, "trashed");

    const restored = await invokeRoute("patch", "/:id/restore", { params: { id: validIds[0] } });
    assert.equal(restored.payload.result.affected, 1);
    assert.equal(state, "trash-restored");

    state = "trashed";
    const deleted = await invokeRoute("delete", "/:id/permanent", { params: { id: validIds[0] }, body: { confirm: true } });
    assert.equal(deleted.payload.result.deleted, 1);
    assert.equal(state, "deleted");
  });
});

test("bulk Trash deduplicates IDs and reports an already-missing inquiry idempotently", async () => {
  await withModelMocks({
    "Inquiry.find": () => queryResult([]),
    "Inquiry.countDocuments": async () => 0,
  }, async () => {
    const response = await invokeRoute("post", "/bulk/trash", { body: { ids: [validIds[0], validIds[0]] } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.result.requested, 1);
    assert.equal(response.payload.result.alreadyMissing, 1);
    assert.equal(response.payload.result.failed, 0);
  });
});

test("Empty Trash requires typed confirmation before any database operation", async () => {
  let databaseCalls = 0;
  await withModelMocks({
    "Inquiry.find": () => { databaseCalls += 1; return queryResult([]); },
    "Inquiry.countDocuments": async () => { databaseCalls += 1; return 0; },
  }, async () => {
    const rejected = await invokeRoute("delete", "/trash/empty", { body: { confirmation: "delete" } });
    assert.equal(rejected.statusCode, 400);
    assert.equal(databaseCalls, 0);
  });
});

test("malformed IDs and non-admin access are rejected cleanly", async () => {
  const malformed = await invokeRoute("patch", "/:id/trash", { params: { id: "not-an-object-id" } });
  assert.equal(malformed.statusCode, 400);

  const layer = routeLayer("post", "/bulk/trash");
  const response = { statusCode: 200, payload: null };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(payload) { response.payload = payload; return this; },
  };
  let nextCalled = false;
  layer.route.stack[1].handle({ user: { role: "viewer" } }, res, () => { nextCalled = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("public intake creates both general contact and artwork inquiries without mutating artwork", async () => {
  const created = [];
  let artworkLookupCount = 0;
  await withModelMocks({
    "Inquiry.create": async (document) => { created.push(document); return document; },
    "Artwork.findById": () => {
      artworkLookupCount += 1;
      return { select: async () => ({ _id: validIds[1], title: "Temporary Artwork" }) };
    },
  }, async () => {
    const contact = await invokeRoute("post", "/", { user: undefined, body: { name: "Temporary Contact", email: "contact@example.com", message: "Test contact" } });
    const artwork = await invokeRoute("post", "/", { user: undefined, body: { name: "Temporary Collector", email: "collector@example.com", message: "Test artwork inquiry", inquiryType: "artwork", artwork: validIds[1] } });
    assert.equal(contact.statusCode, 201);
    assert.equal(artwork.statusCode, 201);
    assert.deepEqual(created.map((entry) => entry.inquiryType), ["contact", "artwork"]);
    assert.equal(created[1].artworkTitle, "Temporary Artwork");
    assert.equal(artworkLookupCount, 1);
  });
});
