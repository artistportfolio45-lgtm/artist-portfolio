// Main entry point for the Artist Portfolio backend API

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const { ensureUploadIndexes } = require("./utils/ensureUploadIndexes");
const { validateGmailConfig } = require("./services/emailService");
const { validateEnvironment } = require("./config/env");
const {
  assertAdminSeedConfig,
  ensureAdminUser,
  getMongoUri,
  invalidateLegacyTwoFactorSecrets,
} = require("./utils/adminSeed");
const {
  generalRateLimiter,
  loginRateLimiter,
  otpSendRateLimiter,
  otpVerifyRateLimiter,
  totpVerifyRateLimiter,
} = require("./middleware/rateLimiter");

const app = express();

const getOrigin = (value) => {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch (error) {
    return value;
  }
};

const getCorsOrigin = (value) => {
  if (!value) return null;

  try {
    const origin = new URL(value).origin;
    if (origin.startsWith("https://") || origin.startsWith("http://localhost")) {
      return origin;
    }
  } catch (error) {
    return null;
  }

  return null;
};

const connectSrc = [
  "'self'",
  getOrigin(process.env.FRONTEND_URL),
  getOrigin(process.env.BACKEND_URL),
  getOrigin(process.env.RENDER_EXTERNAL_URL),
  "http://localhost:5173",
  "http://localhost:5000",
].filter(Boolean);

const allowedOrigins = [
  getCorsOrigin(process.env.FRONTEND_URL),
  "https://artistportfolio46.netlify.app",
  "http://localhost:5173",
].filter(Boolean);

const shouldResetAdminTwoFactorOnStart = (env = process.env) =>
  env.RESET_ADMIN_2FA_ON_START === "true" && env.CONFIRM_RESET_ADMIN_2FA === "RESET_ADMIN_2FA";

const shouldSeedAdminOnStart = (env = process.env) =>
  env.SEED_ADMIN_ON_START === "true" &&
  (env.NODE_ENV !== "production" || env.CONFIRM_PRODUCTION_ADMIN_SEED === "SEED_ADMIN");

// Security: hide Express and trust Render's proxy before IP-based rate limiting.
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Middleware
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));

// Security: apply Helmet headers with an explicit production CSP.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        connectSrc,
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "sameorigin" },
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    xssFilter: true,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error("CORS origin is not allowed");
      error.status = 403;
      error.code = "CORS_ORIGIN_DENIED";
      callback(error);
    },
    credentials: true,
  })
);

// Security: rate limit API traffic and login attempts with JSON-only responses.
app.use("/api", generalRateLimiter);
app.post("/api/auth/login", loginRateLimiter);
app.post("/api/auth/resend-email-otp", otpSendRateLimiter);
app.post("/api/auth/verify-email-otp", otpVerifyRateLimiter);
app.post("/api/auth/verify-totp", totpVerifyRateLimiter);
app.post("/api/security/2fa/enable", totpVerifyRateLimiter);
app.post("/api/security/2fa/verify", totpVerifyRateLimiter);
app.post("/api/security/2fa/disable", totpVerifyRateLimiter);

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/security", require("./routes/security"));
app.use("/api/activity", require("./routes/activity"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/about", require("./routes/about"));
app.use("/api/admin/about", require("./routes/adminAbout"));
app.use("/api/artworks", require("./routes/artworks"));
app.use("/api/inquiries", require("./routes/inquiries"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/public-data", require("./routes/publicData"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Artist Portfolio API is running",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found", errors: [] });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;
  res.status(status).json({
    success: false,
    message: status === 403
      ? "Origin not allowed"
      : process.env.NODE_ENV === "production" ? "Internal server error" : err.message || "Internal server error",
    errors: [],
  });
});

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  validateEnvironment();
  validateGmailConfig();
  await connectDB();
  await ensureUploadIndexes();
  await invalidateLegacyTwoFactorSecrets();

  const seedAdminOnStartRequested = process.env.SEED_ADMIN_ON_START === "true";
  const seedAdminOnStart = shouldSeedAdminOnStart();
  const resetAdminTwoFactorRequested = process.env.RESET_ADMIN_2FA_ON_START === "true";
  const resetAdminTwoFactor = shouldResetAdminTwoFactorOnStart();

  if (seedAdminOnStartRequested && !seedAdminOnStart) {
    console.warn("SEED_ADMIN_ON_START was ignored in production because CONFIRM_PRODUCTION_ADMIN_SEED is not set to SEED_ADMIN.");
  }

  if (resetAdminTwoFactorRequested && !resetAdminTwoFactor) {
    console.warn("RESET_ADMIN_2FA_ON_START was ignored because CONFIRM_RESET_ADMIN_2FA is not set to RESET_ADMIN_2FA.");
  }

  if (seedAdminOnStart || resetAdminTwoFactor) {
    assertAdminSeedConfig({
      mongoUri: getMongoUri(),
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });

    await ensureAdminUser({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      resetTwoFactor: resetAdminTwoFactor,
    });
    console.log("Startup admin seed completed. Remove SEED_ADMIN_ON_START after confirming access.");
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
};

startServer();
