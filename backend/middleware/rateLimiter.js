const rateLimit = require("express-rate-limit");

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const readNumber = (name, defaultValue) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
};

const logBlockedRequest = (req, reason) => {
  console.warn("Rate limit blocked request:", {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    endpoint: req.originalUrl,
    method: req.method,
    reason,
  });
};

const createJsonLimiter = ({ windowMs, max, message, reason, skip }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    handler: (req, res) => {
      logBlockedRequest(req, reason);
      return res.status(429).json({
        success: false,
        message,
      });
    },
  });

const isPublicReadRoute = (req) => {
  if (req.method !== "GET") return false;
  if (req.path === "/settings" || req.path === "/profile" || req.path === "/about" || req.path === "/public-data") {
    return true;
  }
  if (req.path === "/artworks" || req.path === "/artworks/categories") {
    return true;
  }
  if (/^\/artworks\/[a-f\d]{24}(?:\/neighbors)?$/i.test(req.path)) {
    return true;
  }
  return false;
};

// Security: restrict repeated admin login attempts without changing auth behavior.
const loginRateLimiter = createJsonLimiter({
  windowMs: readNumber("LOGIN_RATE_LIMIT_WINDOW", FIFTEEN_MINUTES),
  max: readNumber("LOGIN_RATE_LIMIT_MAX", 5),
  message: "Too many login attempts. Please try again in 15 minutes.",
  reason: "login rate limit exceeded",
});

// Security: apply a conservative baseline limit to all API routes.
const generalRateLimiter = createJsonLimiter({
  windowMs: readNumber("GENERAL_RATE_LIMIT_WINDOW", FIFTEEN_MINUTES),
  max: readNumber("GENERAL_RATE_LIMIT_MAX", 100),
  message: "Too many requests.",
  reason: "general API rate limit exceeded",
  // Upload requests are authenticated and intentionally queued by the admin UI;
  // keep the general limiter for every other API request.
  skip: (req) =>
    isPublicReadRoute(req) ||
    // The authenticated legacy duplicate scan intentionally uses many small
    // requests; route-level admin authorization remains mandatory.
    (req.method === "POST" && req.path === "/artworks/duplicates/scan") ||
    (req.method === "POST" && /^\/artworks(?:\/bulk|\/?$|\/[^/]+\/images)$/.test(req.path)) ||
    (req.method === "GET" && /^\/artworks\/upload-status\/[^/]+$/.test(req.path)),
});

const otpSendRateLimiter = createJsonLimiter({
  windowMs: readNumber("OTP_SEND_RATE_LIMIT_WINDOW", FIFTEEN_MINUTES),
  max: readNumber("OTP_SEND_RATE_LIMIT_MAX", 5),
  message: "Too many verification code requests. Please try again later.",
  reason: "OTP send rate limit exceeded",
});

const otpVerifyRateLimiter = createJsonLimiter({
  windowMs: readNumber("OTP_VERIFY_RATE_LIMIT_WINDOW", FIFTEEN_MINUTES),
  max: readNumber("OTP_VERIFY_RATE_LIMIT_MAX", 10),
  message: "Too many verification attempts. Please try again later.",
  reason: "OTP verification rate limit exceeded",
});

const totpVerifyRateLimiter = createJsonLimiter({
  windowMs: readNumber("TOTP_VERIFY_RATE_LIMIT_WINDOW", FIFTEEN_MINUTES),
  max: readNumber("TOTP_VERIFY_RATE_LIMIT_MAX", 10),
  message: "Too many Authenticator attempts. Please try again later.",
  reason: "TOTP verification rate limit exceeded",
});

module.exports = {
  loginRateLimiter,
  generalRateLimiter,
  otpSendRateLimiter,
  otpVerifyRateLimiter,
  totpVerifyRateLimiter,
  isPublicReadRoute,
};
