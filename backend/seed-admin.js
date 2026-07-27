require("dotenv").config();
const mongoose = require("mongoose");
const { assertAdminSeedConfig, seedAdminAccount } = require("./utils/adminSeed");

const seedAdmin = async () => {
  const { MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD, RESET_ADMIN_TOTP, RESET_ADMIN_2FA_ON_START } = process.env;

  assertAdminSeedConfig({
    mongoUri: MONGO_URI,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected to MongoDB database: ${mongoose.connection.name}`);

  const resetTwoFactor = RESET_ADMIN_TOTP === "true" || RESET_ADMIN_2FA_ON_START === "true";
  await seedAdminAccount({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    resetTwoFactor,
  });

  console.log(
    resetTwoFactor
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
