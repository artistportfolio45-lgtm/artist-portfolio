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
  const securityFields =
    "+twoFactorSecret +pendingTwoFactorSecret +pendingTwoFactorExpiresAt +twoFactorSecretVersion " +
    "+backupRecoveryCodes +emailOtpHash +emailOtpPurpose +emailOtpExpiresAt +emailOtpAttempts +emailOtpLastSentAt " +
    "+loginChallengeHash +loginChallengePurpose +loginChallengeAttempts +sessionVersion";
  let admin = await User.findOne({ email: normalizedEmail }).select(securityFields);

  if (!admin) {
    admin = await User.findOne({ role: "admin" }).select(securityFields);
  }

  const wasCreated = !admin;

  if (!admin) {
    admin = new User({ email: normalizedEmail, role: "admin" });
  }

  if (!wasCreated) admin.sessionVersion = (admin.sessionVersion || 0) + 1;
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
    admin.pendingTwoFactorExpiresAt = null;
    admin.twoFactorSecretVersion = 0;
    admin.backupRecoveryCodes = [];
    admin.emailOtpHash = null;
    admin.emailOtpPurpose = null;
    admin.emailOtpExpiresAt = null;
    admin.emailOtpAttempts = 0;
    admin.loginChallengeHash = null;
    admin.loginChallengePurpose = null;
    admin.loginChallengeAttempts = 0;
  }

  await admin.save();

  logger.log("Admin account created or updated successfully");
  if (resetTwoFactor) {
    logger.log("Admin two-factor authentication reset successfully");
  }

  return { admin, wasCreated, twoFactorReset: resetTwoFactor };
};

const invalidateLegacyTwoFactorSecrets = async ({ logger = console } = {}) => {
  const result = await User.updateMany(
    {
      twoFactorSecret: { $ne: null },
      twoFactorSecretVersion: { $ne: 2 },
    },
    {
      $set: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        pendingTwoFactorSecret: null,
        pendingTwoFactorExpiresAt: null,
        twoFactorSecretVersion: 0,
        backupRecoveryCodes: [],
      },
    }
  );

  if (result.modifiedCount > 0) {
    logger.warn("Invalidated legacy Authenticator enrollment; re-enrollment is required");
  }

  return result.modifiedCount;
};

module.exports = {
  REQUIRED_DATABASE,
  assertAdminSeedConfig,
  ensureAdminUser,
  getDatabaseName,
  getMongoUri,
  invalidateLegacyTwoFactorSecrets,
  seedAdminAccount: ensureAdminUser,
};
