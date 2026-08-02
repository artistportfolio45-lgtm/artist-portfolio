import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicPage = await readFile(new URL("../src/pages/public/AboutPage.jsx", import.meta.url), "utf8");
const editor = await readFile(new URL("../src/pages/admin/AboutPageEditor.jsx", import.meta.url), "utf8");
const profile = await readFile(new URL("../src/pages/admin/ProfilePage.jsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("public About page contains the retrospective sections and accessible archive dialog", () => {
  for (const label of ["Artist statement", "Career timeline", "Selected public works", "Awards & honours", "Press & archive", "The work continues"]) {
    assert.match(publicPage, new RegExp(label, "i"));
  }
  assert.match(publicPage, /role="dialog"/);
  assert.match(publicPage, /event\.key === "Escape"/);
  assert.match(publicPage, /cloudinaryThumbnailUrl/);
  assert.match(publicPage, /loading=\{eager \? "eager" : "lazy"\}/);
});

test("About editor is separate from Profile and exposes all ten editor sections", () => {
  for (const label of ["Hero", "Artist Statement", "Biography", "Artistic Practice", "Timeline", "Public Works", "Awards & Honours", "Press & Archive", "Closing CTA", "Page Settings"]) {
    assert.match(editor, new RegExp(label, "i"));
  }
  assert.doesNotMatch(profile, /About \/ Biography/);
  assert.match(app, /path="\/admin\/about-page"/);
});

test("editor supports draft publishing, duplication, reordering and responsive previews", () => {
  for (const capability of ["Save Draft", "Publish changes", "Duplicate", "draggable", "Mobile", "Tablet", "Desktop", "Reset unsaved", "Clear notices"]) {
    assert.match(editor, new RegExp(capability, "i"));
  }
  assert.match(editor, /aboutAdminAPI\.uploadMedia/);
  assert.match(editor, /beforeunload/);
});
