const REQUIRED = [
  "MONGO_URI",
  "JWT_SECRET",
  "TOTP_ENCRYPTION_KEY",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "GMAIL_SENDER",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "FRONTEND_URL",
];

const placeholder = /^(your_|replace_|change[_-]?me|example|placeholder)|<[^>]+>/i;

const validateEnvironment = (env = process.env) => {
  const missing = REQUIRED.filter((name) => !String(env[name] || "").trim());
  const weak = [];
  for (const name of ["JWT_SECRET", "TOTP_ENCRYPTION_KEY"]) {
    const value = String(env[name] || "");
    if (value && (value.length < 32 || placeholder.test(value))) weak.push(name);
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.TOTP_ENCRYPTION_KEY) weak.push("TOTP_ENCRYPTION_KEY");
  if (missing.length || weak.length) {
    throw new Error(`Invalid server configuration. Missing: ${missing.join(", ") || "none"}; weak or reused: ${[...new Set(weak)].join(", ") || "none"}`);
  }
  for (const name of Object.keys(env)) {
    if (name.startsWith("VITE_") && /(SECRET|TOKEN|PASSWORD|API_KEY|MONGO|JWT)/i.test(name)) {
      throw new Error(`Sensitive backend configuration must not use the VITE_ prefix: ${name}`);
    }
  }
};

module.exports = { validateEnvironment, REQUIRED };
