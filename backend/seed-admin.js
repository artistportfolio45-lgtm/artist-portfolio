require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

const REQUIRED_DATABASE = "artistPortfolio";

const getDatabaseName = (uri) => {
  try {
    const parsed = new URL(uri);
    return parsed.pathname.replace(/^\//, "").split("?")[0];
  } catch {
    return "";
  }
};

const seedAdmin = async () => {
  const { MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD, RESET_ADMIN_TOTP } = process.env;

  if (!MONGO_URI) throw new Error("MONGO_URI must be set");
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  }
  if (ADMIN_PASSWORD.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  const dbName = getDatabaseName(MONGO_URI);
  if (dbName !== REQUIRED_DATABASE) {
    throw new Error(`MONGO_URI must target /${REQUIRED_DATABASE}; current database is "${dbName || "unknown"}"`);
  }

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected to MongoDB database: ${mongoose.connection.name}`);

  const email = ADMIN_EMAIL.toLowerCase().trim();
  let admin = await User.findOne({ email }).select("+twoFactorSecret +backupRecoveryCodes");
  const wasCreated = !admin;

  if (!admin) {
    admin = new User({ email, role: "admin" });
  }

  admin.email = email;
  admin.password = ADMIN_PASSWORD;
  admin.role = "admin";
  admin.failedLoginAttempts = 0;
  admin.accountLockedUntil = null;

  if (RESET_ADMIN_TOTP === "true") {
    admin.twoFactorEnabled = false;
    admin.twoFactorSecret = null;
    admin.backupRecoveryCodes = [];
  }

  await admin.save();

  console.log(wasCreated ? "Admin account created successfully." : "Admin account reset successfully.");
  console.log(`Admin email: ${admin.email}`);
  console.log(`Role: ${admin.role}`);
  console.log(
    RESET_ADMIN_TOTP === "true"
      ? "TOTP was reset. The next login will start Google Authenticator setup."
      : "TOTP state was preserved. Set RESET_ADMIN_TOTP=true to reset a broken authenticator secret."
  );
};

seedAdmin()
  .catch((error) => {
    console.error(`Seed admin failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
