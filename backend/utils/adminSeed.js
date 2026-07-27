const User = require("../models/User");

const REQUIRED_DATABASE = "artistPortfolio";

const getMongoUri = () => process.env.MONGO_URI || process.env.MONGODB_URI;

const getDatabaseName = (uri) => {
  try {
    const parsed = new URL(uri);
    return parsed.pathname.replace(/^\//, "").split("?")[0];
  } catch {
    return "";
  }
};

const assertAdminSeedConfig = ({ mongoUri, email, password, requireDatabase = true }) => {
  if (!mongoUri) throw new Error("MONGO_URI or MONGODB_URI must be set");
  if (!email || !password) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");

  const dbName = getDatabaseName(mongoUri);
  if (requireDatabase && dbName !== REQUIRED_DATABASE) {
    throw new Error(`MongoDB URI must target /${REQUIRED_DATABASE}; current database is "${dbName || "unknown"}"`);
  }

  return dbName;
};

const ensureAdminUser = async ({
  email,
  password,
  resetTwoFactor = false,
  logger = console,
}) => {
  const normalizedEmail = email.toLowerCase().trim();
  let admin = await User.findOne({ email: normalizedEmail }).select("+twoFactorSecret +backupRecoveryCodes");

  if (!admin) {
    admin = await User.findOne({ role: "admin" }).select("+twoFactorSecret +backupRecoveryCodes");
  }

  const wasCreated = !admin;

  if (!admin) {
    admin = new User({ email: normalizedEmail, role: "admin" });
  }

  admin.email = normalizedEmail;
  admin.password = password;
  admin.role = "admin";
  admin.isActive = true;
  admin.failedLoginAttempts = 0;
  admin.accountLockedUntil = null;

  if (resetTwoFactor) {
    admin.twoFactorEnabled = false;
    admin.twoFactorSecret = null;
    admin.pendingTwoFactorSecret = null;
    admin.backupRecoveryCodes = [];
  }

  await admin.save();

  logger.log("Admin account created or updated successfully");
  if (resetTwoFactor) {
    logger.log("Admin two-factor authentication reset successfully");
  }

  return { admin, wasCreated, twoFactorReset: resetTwoFactor };
};

module.exports = {
  REQUIRED_DATABASE,
  assertAdminSeedConfig,
  ensureAdminUser,
  getDatabaseName,
  getMongoUri,
  seedAdminAccount: ensureAdminUser,
};
