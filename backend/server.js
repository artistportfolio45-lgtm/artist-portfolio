// Main entry point for the Artist Portfolio backend API

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const {
  generalRateLimiter,
  loginRateLimiter,
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
  "https://artistportfolio45.netlify.app",
  "http://localhost:5173",
].filter(Boolean);

// Security: hide Express and trust Render's proxy before IP-based rate limiting.
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
        frameAncestors: ["'none'"],
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
    frameguard: { action: "deny" },
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

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);

// Security: rate limit API traffic and login attempts with JSON-only responses.
app.use("/api", generalRateLimiter);
app.post("/api/auth/login", loginRateLimiter);

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/security", require("./routes/security"));
app.use("/api/activity", require("./routes/activity"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/artworks", require("./routes/artworks"));
app.use("/api/inquiries", require("./routes/inquiries"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/public-data", require("./routes/publicData"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Artist Portfolio API is running",
    env: process.env.NODE_ENV,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found", errors: [] });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message || "Internal server error",
    errors: [],
  });
});

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
};

startServer();
