// Include compact candidates for the two-column mobile masonry. Without
// these, high-DPI phones can select a 960px asset for a card under 200px wide.
export const GALLERY_THUMBNAIL_WIDTHS = [240, 320, 480, 720, 960, 1440];

const CLOUDINARY_UPLOAD_PATH = "/image/upload/";

export const isCloudinaryDeliveryUrl = (url) => {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const isCloudinaryHost =
      parsed.hostname === "res.cloudinary.com" || parsed.hostname.endsWith(".cloudinary.com");

    return isCloudinaryHost && parsed.pathname.includes(CLOUDINARY_UPLOAD_PATH);
  } catch {
    return false;
  }
};

export const cloudinaryThumbnailUrl = (url, width) => {
  const requestedWidth = Number.parseInt(width, 10);
  if (!isCloudinaryDeliveryUrl(url) || !Number.isFinite(requestedWidth) || requestedWidth <= 0) {
    return url;
  }

  const transformation = `c_limit,w_${requestedWidth}/f_auto,q_auto`;
  return url.replace(
    CLOUDINARY_UPLOAD_PATH,
    `${CLOUDINARY_UPLOAD_PATH}${transformation}/`
  );
};

export const galleryThumbnailWidths = (originalWidth) => {
  const sourceWidth = Number(originalWidth);
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) {
    return [...GALLERY_THUMBNAIL_WIDTHS];
  }

  const maximumWidth = GALLERY_THUMBNAIL_WIDTHS[GALLERY_THUMBNAIL_WIDTHS.length - 1];
  const roundedSourceWidth = Math.round(sourceWidth);
  if (roundedSourceWidth <= 0) return [...GALLERY_THUMBNAIL_WIDTHS];

  const cappedSourceWidth = Math.min(roundedSourceWidth, maximumWidth);
  const widths = GALLERY_THUMBNAIL_WIDTHS.filter((width) => width <= cappedSourceWidth);

  if (!widths.includes(cappedSourceWidth)) widths.push(cappedSourceWidth);
  return widths.sort((first, second) => first - second);
};

export const imageAspectRatio = (image, fallback = "4 / 5") => {
  const width = Number(image?.width);
  const height = Number(image?.height);

  return width > 0 && height > 0 ? `${width} / ${height}` : fallback;
};
