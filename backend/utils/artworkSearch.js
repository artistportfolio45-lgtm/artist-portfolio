const MAX_SEARCH_QUERY_LENGTH = 120;
const MIN_SEARCH_QUERY_LENGTH = 2;

const SEARCH_FIELDS = [
  ["title", 1200],
  ["category", 520],
  ["medium", 500],
  ["year", 520],
  ["tags", 480],
  ["keywords", 480],
  ["collection", 460],
  ["series", 430],
  ["catalogueNumber", 420],
  ["dimensions", 360],
  ["creationLocation", 340],
  ["provenance", 260],
  ["exhibitionHistory", 240],
  ["publications", 230],
  ["description", 180],
];

const valueText = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join(" ");
  if (value === null || value === undefined) return "";
  return String(value);
};

const normalizeSearchText = (value) => valueText(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .replace(/\s+/g, " ");

const prepareSearchQuery = (value) => {
  const raw = valueText(value).trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
  const normalized = normalizeSearchText(raw);
  return {
    raw,
    normalized,
    tokens: normalized ? [...new Set(normalized.split(" ").filter(Boolean))] : [],
    valid: normalized.length >= MIN_SEARCH_QUERY_LENGTH,
  };
};

const boundedEditDistance = (first, second, maximum) => {
  if (Math.abs(first.length - second.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    let rowMinimum = current[0];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitution = previous[secondIndex - 1] +
        (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1);
      const value = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        substitution
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }

  return previous[second.length];
};

const tokenMatchQuality = (queryToken, candidateToken) => {
  if (!queryToken || !candidateToken) return 0;
  if (queryToken === candidateToken) return 1;
  if (queryToken.length >= 2 && candidateToken.startsWith(queryToken)) return 0.88;
  if (candidateToken.length >= 3 && queryToken.startsWith(candidateToken)) return 0.76;
  if (queryToken.length >= 3 && candidateToken.includes(queryToken)) return 0.72;
  if (queryToken.length < 4 || candidateToken.length < 3) return 0;

  const maximum = Math.max(queryToken.length, candidateToken.length) <= 6 ? 1 : 2;
  const distance = boundedEditDistance(queryToken, candidateToken, maximum);
  if (distance > maximum) return 0;
  const similarity = 1 - distance / Math.max(queryToken.length, candidateToken.length);
  return similarity >= 0.72 ? 0.52 + similarity * 0.28 : 0;
};

const searchableField = (artwork, key, weight) => {
  const normalized = normalizeSearchText(artwork?.[key]);
  return {
    key,
    weight,
    normalized,
    tokens: normalized ? normalized.split(" ") : [],
  };
};

const scoreArtworkSearch = (artwork, preparedOrRawQuery) => {
  const query = typeof preparedOrRawQuery === "object" && preparedOrRawQuery?.tokens
    ? preparedOrRawQuery
    : prepareSearchQuery(preparedOrRawQuery);
  if (!query.valid) return null;

  const fields = SEARCH_FIELDS.map(([key, weight]) => searchableField(artwork, key, weight));
  const title = fields[0];
  let score = 0;
  let titleMatches = 0;
  let exactTitleWords = 0;
  let weakestQuality = 1;

  for (const queryToken of query.tokens) {
    let best = null;
    for (const field of fields) {
      for (const candidateToken of field.tokens) {
        const quality = tokenMatchQuality(queryToken, candidateToken);
        const weighted = quality * field.weight;
        if (quality && (!best || weighted > best.weighted)) {
          best = { field: field.key, quality, weighted };
        }
      }
    }
    if (!best) return null;
    score += best.weighted;
    weakestQuality = Math.min(weakestQuality, best.quality);

    const bestTitleQuality = title.tokens.reduce(
      (current, token) => Math.max(current, tokenMatchQuality(queryToken, token)),
      0
    );
    if (bestTitleQuality) titleMatches += 1;
    if (bestTitleQuality === 1) exactTitleWords += 1;
  }

  if (title.normalized === query.normalized) {
    score += 20000;
  } else if (title.normalized.startsWith(`${query.normalized} `)) {
    score += 17000;
  } else if (title.normalized.includes(query.normalized)) {
    score += 15000;
  } else if (exactTitleWords === query.tokens.length) {
    score += 12500 + query.tokens.length * 250;
  } else if (titleMatches === query.tokens.length) {
    score += (weakestQuality >= 0.85 ? 9500 : 7200) + query.tokens.length * 180;
  } else if (titleMatches > 0) {
    score += titleMatches * 2600;
  }

  return Math.round(score * 100) / 100;
};

const artworkIdentity = (artwork, index) =>
  String(artwork?._id || artwork?.id || artwork?.slug || `index:${index}`);

const searchAndRankArtworks = (artworks, rawQuery, tieBreaker) => {
  const query = prepareSearchQuery(rawQuery);
  if (!query.raw) {
    const seen = new Set();
    return (Array.isArray(artworks) ? artworks : []).filter((artwork, index) => {
      const id = artworkIdentity(artwork, index);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  if (!query.valid) return [];

  const byId = new Map();
  (Array.isArray(artworks) ? artworks : []).forEach((artwork, index) => {
    const score = scoreArtworkSearch(artwork, query);
    if (score === null) return;
    const id = artworkIdentity(artwork, index);
    const existing = byId.get(id);
    if (!existing || score > existing.score) byId.set(id, { artwork, score, index });
  });

  return [...byId.values()]
    .sort((first, second) =>
      second.score - first.score ||
      (typeof tieBreaker === "function" ? tieBreaker(first.artwork, second.artwork) : first.index - second.index)
    )
    .map((entry) => entry.artwork);
};

module.exports = {
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
  SEARCH_FIELDS,
  boundedEditDistance,
  normalizeSearchText,
  prepareSearchQuery,
  scoreArtworkSearch,
  searchAndRankArtworks,
  tokenMatchQuality,
};
