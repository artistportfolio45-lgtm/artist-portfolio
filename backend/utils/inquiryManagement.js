const mongoose = require("mongoose");

const MAX_BULK_INQUIRIES = 5000;
const INQUIRY_CHUNK_SIZE = 200;
const MAX_INQUIRY_SEARCH_LENGTH = 120;

const trimText = (value) => (typeof value === "string" ? value.trim() : "");
const escapeRegex = (value) => trimText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validBooleanFilter = (value) => value === true || value === false || value === "true" || value === "false";
const booleanFilter = (value) => value === true || value === "true";

const parseDateBoundary = (value, endOfDay = false) => {
  const raw = trimText(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildInquiryFilter = (input = {}, { trash = false } = {}) => {
  const query = { deletedAt: trash ? { $ne: null } : null };
  const searchTerm = trimText(input.search).slice(0, MAX_INQUIRY_SEARCH_LENGTH);
  if (searchTerm) {
    const safeSearch = escapeRegex(searchTerm);
    query.$or = ["name", "email", "subject", "message", "artworkTitle"].map((field) => ({
      [field]: { $regex: safeSearch, $options: "i" },
    }));
  }
  if (validBooleanFilter(input.isRead)) query.isRead = booleanFilter(input.isRead);
  if (validBooleanFilter(input.isResolved)) query.isResolved = booleanFilter(input.isResolved) ? true : { $ne: true };
  if (["contact", "artwork"].includes(input.inquiryType)) query.inquiryType = input.inquiryType;

  const dateFrom = parseDateBoundary(input.dateFrom);
  const dateTo = parseDateBoundary(input.dateTo, true);
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = dateFrom;
    if (dateTo) query.createdAt.$lte = dateTo;
  }
  return query;
};

const validateInquiryFilters = (input = {}) => {
  if (input.inquiryType && !["all", "contact", "artwork"].includes(input.inquiryType)) return "Invalid inquiry type filter";
  for (const field of ["isRead", "isResolved"]) {
    if (input[field] !== undefined && input[field] !== "" && input[field] !== "all" && !validBooleanFilter(input[field])) {
      return `Invalid ${field} filter`;
    }
  }
  const from = input.dateFrom ? parseDateBoundary(input.dateFrom) : null;
  const to = input.dateTo ? parseDateBoundary(input.dateTo, true) : null;
  if (input.dateFrom && !from) return "Invalid start date filter";
  if (input.dateTo && !to) return "Invalid end date filter";
  if (from && to && from > to) return "Start date must be before end date";
  return "";
};

const normalizeInquiryIds = (value) => {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "Select at least one inquiry", ids: [] };
  }
  const ids = [...new Set(value.map((id) => String(id || "").trim()))];
  if (ids.length > MAX_BULK_INQUIRIES) {
    return { error: `A maximum of ${MAX_BULK_INQUIRIES} inquiries can be processed at once`, ids: [] };
  }
  const invalidIds = ids.filter((id) => !mongoose.isValidObjectId(id));
  if (invalidIds.length) return { error: "One or more inquiry IDs are invalid", ids: [] };
  return { error: "", ids };
};

const chunkInquiryIds = (ids, size = INQUIRY_CHUNK_SIZE) => {
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
};

module.exports = {
  INQUIRY_CHUNK_SIZE,
  MAX_BULK_INQUIRIES,
  MAX_INQUIRY_SEARCH_LENGTH,
  buildInquiryFilter,
  chunkInquiryIds,
  escapeRegex,
  normalizeInquiryIds,
  parseDateBoundary,
  trimText,
  validateInquiryFilters,
};
