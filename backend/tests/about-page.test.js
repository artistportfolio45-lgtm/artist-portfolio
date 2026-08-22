const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const AboutPage = require("../models/AboutPage");
const { publicAboutContent } = require("../utils/aboutPage");
const aboutRouter = require("../routes/about");
const adminAboutRouter = require("../routes/adminAbout");
const { uploadAboutMedia } = require("../config/cloudinary");

const routes = (router) => router.stack
  .filter((layer) => layer.route)
  .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

test("AboutPage starts with verified factual content and no invented dates", () => {
  const aboutPage = new AboutPage();
  assert.equal(aboutPage.draft.hero.name, "Dr. Gurugovind Namdev Ambe");
  assert.equal(aboutPage.draft.practices.length, 4);
  assert.equal(aboutPage.draft.timeline.length, 4);
  assert.equal(aboutPage.draft.timeline.every((item) => item.dateLabel === ""), true);
  assert.match(aboutPage.draft.biography.body, /first position at the Pune centre/);
  assert.match(aboutPage.draft.biography.body, /ninth position in the Maharashtra merit list/);
});

test("public About content excludes admin source notes and unpublished entries", () => {
  const aboutPage = new AboutPage();
  aboutPage.published.timeline[0].published = false;
  aboutPage.published.timeline[1].sourceNote = "private proof note";
  aboutPage.published.pressArchive.push(...Array.from({ length: 13 }, (_, index) => ({
    publicationName: `Publication ${index + 1}`,
    headline: `Archive ${index + 1}`,
    published: true,
    order: index,
    sourceNote: "admin only",
  })));

  const result = publicAboutContent(aboutPage);
  assert.equal(result.timeline.some((item) => item.title === "G.D. Art recognition"), false);
  assert.equal(result.pressArchive.length, 12);
  assert.equal(JSON.stringify(result).includes("sourceNote"), false);
  assert.equal(JSON.stringify(result).includes("private proof note"), false);
});

test("draft edits remain isolated until copied to the published snapshot", () => {
  const aboutPage = new AboutPage();
  const publishedName = publicAboutContent(aboutPage).hero.name;
  aboutPage.draft.hero.name = "Draft-only name";
  assert.equal(publicAboutContent(aboutPage).hero.name, publishedName);
  aboutPage.published = aboutPage.draft.toObject();
  assert.equal(publicAboutContent(aboutPage).hero.name, "Draft-only name");
});

test("repeatable timeline entries support add, edit, reorder and delete", () => {
  const aboutPage = new AboutPage();
  aboutPage.draft.timeline.push({ title: "Archive test", published: false, order: 99 });
  const added = aboutPage.draft.timeline.at(-1);
  added.set({ title: "Edited archive test", order: -1 });
  aboutPage.draft.timeline.sort((first, second) => first.order - second.order);
  assert.equal(aboutPage.draft.timeline[0].title, "Edited archive test");
  aboutPage.draft.timeline.id(added._id).deleteOne();
  assert.equal(aboutPage.draft.timeline.id(added._id), null);
});

test("public and protected About API routes are registered", () => {
  assert.deepEqual(routes(aboutRouter), [{ path: "/", methods: ["get"] }]);
  const adminRoutes = routes(adminAboutRouter);
  for (const expected of [
    ["/", "get"], ["/", "put"], ["/media", "post"], ["/publish", "patch"],
    ["/:section", "post"], ["/:section/:itemId", "put"],
    ["/:section/:itemId", "delete"], ["/:section/reorder", "patch"],
  ]) assert.ok(adminRoutes.some((route) => route.path === expected[0] && route.methods.includes(expected[1])));
  assert.ok(uploadAboutMedia);
});

test("public snapshot export includes published About content", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../utils/publicSnapshot.js"), "utf8");
  assert.match(source, /about:\s*removeManagementFields\(publicAboutContent\(aboutPage\)\)/);
});
