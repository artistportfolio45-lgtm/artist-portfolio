// config/cloudinary.js
// Cloudinary setup for image uploads

const cloudinaryModule = require("cloudinary");
const cloudinary = cloudinaryModule.v2;
const multerStorageCloudinary = require("multer-storage-cloudinary");
const multer = require("multer");

const ARTWORK_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const ARTWORK_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const MAX_ARTWORK_FILE_SIZE = 10 * 1024 * 1024;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper to create a storage engine compatible with different versions
function createStorage(opts) {
  // If package exports CloudinaryStorage class (newer versions)
  if (multerStorageCloudinary && multerStorageCloudinary.CloudinaryStorage) {
    const { CloudinaryStorage } = multerStorageCloudinary;
    return new CloudinaryStorage({ cloudinary, params: opts.params });
  }

  // If package exports a function (older versions)
  if (typeof multerStorageCloudinary === "function") {
    // map params keys to older API shape if necessary
    const cfg = Object.assign({}, opts.params || {});
    // older API expects allowedFormats instead of allowed_formats
    if (cfg.allowed_formats && !cfg.allowedFormats) {
      cfg.allowedFormats = cfg.allowed_formats;
      delete cfg.allowed_formats;
    }
    return multerStorageCloudinary({
      cloudinary: cloudinaryModule,
      folder: cfg.folder || cfg.path,
      allowedFormats: cfg.allowedFormats,
      transformation: cfg.transformation,
    });
  }

  throw new Error("Unsupported multer-storage-cloudinary version");
}

// Cloudinary storage for artwork images
const artworkStorage = createStorage({
  params: {
    folder: "artist-portfolio/artworks",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  },
});

// Cloudinary storage for profile photo
const profileStorage = createStorage({
  params: {
    folder: "artist-portfolio/profile",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto" }],
  },
});

// Cloudinary storage for logo
const logoStorage = createStorage({
  params: {
    folder: "artist-portfolio/settings",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "svg"],
    transformation: [{ quality: "auto" }],
  },
});

const uploadArtwork = multer({ storage: artworkStorage });
const uploadBulkArtwork = multer({
  storage: multer.memoryStorage(),
  // The UI sends one file at a time. Deliberately do not impose a file-count
  // limit so the endpoint also remains valid for arbitrarily large batches.
  limits: { fileSize: MAX_ARTWORK_FILE_SIZE },
  fileFilter: (req, file, callback) => {
    const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();
    if (ARTWORK_IMAGE_MIME_TYPES.has(file.mimetype) && ARTWORK_IMAGE_EXTENSIONS.has(extension)) {
      callback(null, true);
      return;
    }
    const error = new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname);
    error.message = "Only JPG, PNG, WebP, and AVIF artwork images are supported";
    callback(error);
  },
});
const uploadProfile = multer({ storage: profileStorage });
const uploadLogo = multer({ storage: logoStorage });

const getCloudinaryFileInfo = (file) => ({
  url: file?.path || file?.secure_url || file?.url,
  publicId: file?.filename || file?.public_id || file?.publicId,
  ...(Number(file?.width) > 0 ? { width: Number(file.width) } : {}),
  ...(Number(file?.height) > 0 ? { height: Number(file.height) } : {}),
});

module.exports = {
  cloudinary,
  getCloudinaryFileInfo,
  uploadArtwork,
  uploadBulkArtwork,
  uploadProfile,
  uploadLogo,
  ARTWORK_IMAGE_MIME_TYPES,
  ARTWORK_IMAGE_EXTENSIONS,
  MAX_ARTWORK_FILE_SIZE,
};
