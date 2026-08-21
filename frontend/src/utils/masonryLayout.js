const FALLBACK_HEIGHT_RATIO = 1.25;

const artworkHeightRatio = (artwork) => {
  const image = artwork?.images?.[0];
  const width = Number(image?.width);
  const height = Number(image?.height);
  return width > 0 && height > 0 ? height / width : FALLBACK_HEIGHT_RATIO;
};

export const distributeByShortestColumn = (artworks = [], columnCount = 1) => {
  const safeColumnCount = Math.max(1, Math.floor(Number(columnCount) || 1));
  const columns = Array.from({ length: safeColumnCount }, () => []);
  const heights = Array(safeColumnCount).fill(0);

  artworks.forEach((artwork, index) => {
    let shortestColumn = 0;
    for (let column = 1; column < safeColumnCount; column += 1) {
      if (heights[column] < heights[shortestColumn]) shortestColumn = column;
    }
    columns[shortestColumn].push({ artwork, index });
    heights[shortestColumn] += artworkHeightRatio(artwork);
  });

  return columns;
};
