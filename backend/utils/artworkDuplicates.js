const crypto = require("crypto");

const normalizeFilename = (value = "") => String(value)
  .trim()
  .toLowerCase()
  .replace(/\.[^.]+$/, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const hammingDistance = (first = "", second = "") => {
  if (!first || first.length !== second.length || !/^[a-f0-9]+$/i.test(first + second)) return Infinity;
  let distance = 0;
  for (let index = 0; index < first.length; index += 1) {
    let value = parseInt(first[index], 16) ^ parseInt(second[index], 16);
    while (value) { distance += value & 1; value >>= 1; }
  }
  return distance;
};

const duplicateReason = (candidate, artwork, threshold = 5) => {
  if (candidate.contentHash && candidate.contentHash === artwork.contentHash) return "identical file";
  if (candidate.perceptualHash && artwork.perceptualHash
    && hammingDistance(candidate.perceptualHash, artwork.perceptualHash) <= threshold) return "visually identical image";
  return "";
};

const buildDuplicateGroups = (artworks, threshold = 5) => {
  const groups = [];
  const assigned = new Set();
  artworks.forEach((artwork, index) => {
    const id = String(artwork._id);
    if (assigned.has(id)) return;
    const matches = [artwork];
    for (let next = index + 1; next < artworks.length; next += 1) {
      const other = artworks[next];
      if (!assigned.has(String(other._id)) && duplicateReason(artwork, other, threshold)) matches.push(other);
    }
    if (matches.length > 1) {
      matches.forEach((item) => assigned.add(String(item._id)));
      matches.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      groups.push({ keep: matches[0], duplicates: matches.slice(1) });
    }
  });
  return groups;
};

module.exports = { buildDuplicateGroups, duplicateReason, hammingDistance, normalizeFilename, sha256 };
