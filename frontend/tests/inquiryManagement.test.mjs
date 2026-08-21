import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deselectInquiryPage,
  emptyInquirySelection,
  inquiryIsSelected,
  inquirySelectionCount,
  inquirySelectionRequest,
  selectAllFilteredInquiries,
  selectInquiryPage,
  toggleInquirySelection,
} from "../src/utils/inquirySelection.js";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("current-page selection persists while navigating other pages", () => {
  let selection = selectInquiryPage(emptyInquirySelection(), ["page-1-a", "page-1-b"]);
  selection = selectInquiryPage(selection, ["page-2-a"]);
  assert.equal(inquirySelectionCount(selection), 3);
  assert.ok(inquiryIsSelected(selection, "page-1-a"));
  selection = deselectInquiryPage(selection, ["page-2-a"]);
  assert.equal(inquirySelectionCount(selection), 2);
});

test("select-all-filtered tracks exclusions and sends the exact filter scope", () => {
  let selection = selectAllFilteredInquiries(125);
  selection = toggleInquirySelection(selection, "excluded-id");
  assert.equal(inquirySelectionCount(selection), 124);
  assert.equal(inquiryIsSelected(selection, "excluded-id"), false);
  const request = inquirySelectionRequest(selection, { inquiryType: "artwork", isRead: "false" });
  assert.deepEqual(request, { filtered: true, filters: { inquiryType: "artwork", isRead: "false" }, excludedIds: ["excluded-id"] });
});

test("individual selection toggles without duplicate IDs", () => {
  let selection = emptyInquirySelection();
  selection = toggleInquirySelection(selection, "one");
  selection = toggleInquirySelection(selection, "one");
  assert.equal(inquirySelectionCount(selection), 0);
});

test("Inquiries UI exposes filters, pagination, Trash lifecycle and accessible confirmation", async () => {
  const page = await source("src/pages/admin/InquiriesPage.jsx");
  for (const token of ["Search sender, email, message", "General contact", "Artwork enquiry", "Read + unread", "All resolution", "dateFrom", "dateTo", "Select current page", "Select all", "Restore selected", "Delete selected", "Empty Trash", "Page {page} of {totalPages}"]) assert.ok(page.includes(token), token);
  for (const token of ['role="dialog"', 'aria-modal="true"', "Sender", "Email", "Type", "Artwork", "Submitted", "Type DELETE", "Delete this inquiry? This action cannot be undone."]) assert.ok(page.includes(token), token);
  for (const resultToken of ["already missing", "unchanged", "failed", "resultDetails"]) assert.ok(page.includes(resultToken), resultToken);
  assert.match(page, /overflow-x-hidden/);
  assert.match(page, /requestId !== requestIdRef\.current/);
  assert.match(page, /if \(page > safePages\) setPage\(safePages\)/);
});

test("API client uses recoverable and permanent inquiry endpoints", async () => {
  const api = await source("src/services/api.js");
  for (const endpoint of ["/inquiries/bulk/trash", "/inquiries/filtered/trash", "/inquiries/bulk/restore", "/inquiries/filtered/restore", "/inquiries/bulk/permanent", "/inquiries/filtered/permanent", "/inquiries/trash/empty", "moveToTrash", "permanentDelete"]) assert.ok(api.includes(endpoint), endpoint);
});

test("public inquiry forms still submit both contact and artwork inquiry types", async () => {
  const [contact, artwork] = await Promise.all([source("src/pages/public/ContactPage.jsx"), source("src/pages/public/ArtworkDetailPage.jsx")]);
  assert.match(contact, /inquiryType: selectedArtwork \? "artwork" : "contact"/);
  assert.match(contact, /inquiryAPI\.create\(payload\)/);
  assert.match(artwork, /inquiryType: "artwork"/);
  assert.match(artwork, /inquiryAPI\.create\(payload\)/);
  assert.match(artwork, /Netlify backup artwork inquiry failed after backend save/);
});
