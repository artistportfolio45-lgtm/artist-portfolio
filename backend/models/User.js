const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const getEncryptionKey = () => {
  const secret = process.env.TOTP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("TOTP_ENCRYPTION_KEY must be configured");
  }

  return crypto.createHash("sha256").update(secret).digest();
};

const encryptSecret = (plainText) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
};

const decryptSecret = (payload) => {
  const [ivHex, authTagHex, encryptedHex] = payload.split(":");

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};

const formatRecoveryCode = () => {
  const raw = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
};

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
    },
    role: {
      type: String,
      enum: ["admin"],
      default: "admin",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: null,
      select: false,
    },
    pendingTwoFactorSecret: {
      type: String,
      default: null,
      select: false,
    },
    pendingTwoFactorExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    twoFactorSecretVersion: {
      type: Number,
      default: 0,
      select: false,
    },
    backupRecoveryCodes: {
      type: [
        {
          codeHash: { type: String, required: true },
          usedAt: { type: Date, default: null },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      select: false,
    },
    emailOtpHash: {
      type: String,
      default: null,
      select: false,
    },
    emailOtpPurpose: {
      type: String,
      default: null,
      select: false,
    },
    emailOtpExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    emailOtpAttempts: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    emailOtpLastSentAt: {
      type: Date,
      default: null,
      select: false,
    },
    loginChallengeHash: {
      type: String,
      default: null,
      select: false,
    },
    loginChallengePurpose: {
      type: String,
      default: null,
      select: false,
    },
    loginChallengeAttempts: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    accountLockedUntil: {
      type: Date,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    lastPasswordChanged: {
      type: Date,
      default: null,
    },
    sessionVersion: { type: Number, default: 0, min: 0, select: false },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.lastPasswordChanged = new Date();
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.isAccountLocked = function () {
  return Boolean(this.accountLockedUntil && this.accountLockedUntil > new Date());
};

userSchema.methods.setTwoFactorSecret = function (secret) {
  this.twoFactorSecret = encryptSecret(secret);
};

userSchema.methods.getTwoFactorSecret = function () {
  if (!this.twoFactorSecret) return null;
  return decryptSecret(this.twoFactorSecret);
};

userSchema.methods.setPendingTwoFactorSecret = function (secret) {
  this.pendingTwoFactorSecret = encryptSecret(secret);
};

userSchema.methods.getPendingTwoFactorSecret = function () {
  if (!this.pendingTwoFactorSecret) return null;
  return decryptSecret(this.pendingTwoFactorSecret);
};

userSchema.methods.generateBackupRecoveryCodes = async function (count = 10) {
  const codes = Array.from({ length: count }, formatRecoveryCode);

  this.backupRecoveryCodes = await Promise.all(
    codes.map(async (code) => ({
      codeHash: await bcrypt.hash(code, 10),
      usedAt: null,
      createdAt: new Date(),
    }))
  );

  return codes;
};

userSchema.methods.useBackupRecoveryCode = async function (code) {
  const normalizedCode = String(code || "").trim().toUpperCase();

  for (const recoveryCode of this.backupRecoveryCodes || []) {
    if (recoveryCode.usedAt) continue;

    const isMatch = await bcrypt.compare(normalizedCode, recoveryCode.codeHash);
    if (isMatch) {
      recoveryCode.usedAt = new Date();
      return true;
    }
  }

  return false;
};

module.exports = mongoose.model("User", userSchema);
