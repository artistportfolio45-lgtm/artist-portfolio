const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { logActivity } = require("../middleware/activityLogger");
const { sendLoginOtp } = require("../services/emailService");

const router = express.Router();

const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS || 5);
const ACCOUNT_LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES || 15);
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_TOTP_ATTEMPTS = 5;
const CURRENT_TOTP_SECRET_VERSION = 2;
const LOGIN_SECURITY_FIELDS = [
  "+twoFactorSecret",
  "+twoFactorSecretVersion",
  "+backupRecoveryCodes",
  "+emailOtpHash",
  "+emailOtpPurpose",
  "+emailOtpExpiresAt",
  "+emailOtpAttempts",
  "+emailOtpLastSentAt",
  "+emailOtpLastSentAt",
  "+loginChallengeHash",
  "+loginChallengePurpose",
  "+loginChallengeAttempts",
].join(" ");

const successResponse = (res, statusCode, message, data = {}) =>
  res.status(statusCode).json({ success: true, message, data });

const errorResponse = (res, statusCode, message, errors = []) =>
  res.status(statusCode).json({ success: false, message, errors });

const generateAccessToken = (id) =>
  jwt.sign({ id, type: "access" }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const hashValue = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

const hashOtp = (challengeId, otp) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${challengeId}:${otp}`)
    .digest("hex");

const safeEqual = (first, second) => {
  const firstBuffer = Buffer.from(String(first || ""), "hex");
  const secondBuffer = Buffer.from(String(second || ""), "hex");
  return (
    firstBuffer.length > 0 &&
    firstBuffer.length === secondBuffer.length &&
    crypto.timingSafeEqual(firstBuffer, secondBuffer)
  );
};

const maskEmail = (email) => {
  const [local, domain] = String(email).split("@");
  if (!local || !domain) return "your registered email";
  if (local.length === 1) return `${local}***@${domain}`;
  return `${local[0]}${"*".repeat(Math.max(3, local.length - 2))}${local.at(-1)}@${domain}`;
};

const verifyTotpCode = (secret, token) =>
  Boolean(
    secret &&
      /^\d{6}$/.test(String(token || "").trim()) &&
      speakeasy.totp.verify({
        secret,
        encoding: "base32",
        token: String(token).trim(),
        window: 1,
      })
  );

const clearEmailOtp = (user) => {
  user.emailOtpHash = null;
  user.emailOtpPurpose = null;
  user.emailOtpExpiresAt = null;
  user.emailOtpAttempts = 0;
};

const clearLoginChallenge = (user) => {
  user.loginChallengeHash = null;
  user.loginChallengePurpose = null;
  user.loginChallengeAttempts = 0;
};

const createChallenge = (user, stage) => {
  const challengeId = crypto.randomBytes(32).toString("hex");
  user.loginChallengeHash = hashValue(challengeId);
  user.loginChallengePurpose = stage;
  user.loginChallengeAttempts = 0;

  const challengeToken = jwt.sign(
    {
      sub: String(user._id),
      type: "login_challenge",
      stage,
      jti: challengeId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );

  return { challengeId, challengeToken };
};

const resolveChallenge = async (token, expectedStage) => {
  if (!token) throw new Error("INVALID_CHALLENGE");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new Error("INVALID_CHALLENGE");
  }

  if (
    decoded.type !== "login_challenge" ||
    decoded.stage !== expectedStage ||
    !decoded.sub ||
    !decoded.jti
  ) {
    throw new Error("INVALID_CHALLENGE");
  }

  const user = await User.findById(decoded.sub).select(LOGIN_SECURITY_FIELDS);
  if (
    !user ||
    user.isActive === false ||
    user.loginChallengePurpose !== expectedStage ||
    !safeEqual(user.loginChallengeHash, hashValue(decoded.jti))
  ) {
    throw new Error("INVALID_CHALLENGE");
  }

  return { user, decoded };
};

const issueEmailChallenge = async (user, { enforceCooldown = false } = {}) => {
  const now = Date.now();
  const lastSentAt = user.emailOtpLastSentAt?.getTime() || 0;
  const remainingMs = OTP_RESEND_COOLDOWN_MS - (now - lastSentAt);

  if (enforceCooldown && remainingMs > 0) {
    const error = new Error("OTP_COOLDOWN");
    error.retryAfter = Math.ceil(remainingMs / 1000);
    throw error;
  }

  clearEmailOtp(user);
  const { challengeId, challengeToken } = createChallenge(user, "email_otp");
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

  user.emailOtpHash = hashOtp(challengeId, otp);
  user.emailOtpPurpose = "admin_login";
  user.emailOtpExpiresAt = new Date(now + OTP_EXPIRY_MS);
  user.emailOtpAttempts = 0;
  user.emailOtpLastSentAt = new Date(now);
  await user.save();

  try {
    await sendLoginOtp({ to: user.email, code: otp });
  } catch (error) {
    clearEmailOtp(user);
    clearLoginChallenge(user);
    await user.save();
    throw error;
  }

  return {
    challengeToken,
    nextStep: "email_otp",
    maskedEmail: maskEmail(user.email),
    resendAfterSeconds: 60,
  };
};

const completeLogin = async (req, user) => {
  clearEmailOtp(user);
  clearLoginChallenge(user);
  user.emailVerified = true;
  user.failedLoginAttempts = 0;
  user.accountLockedUntil = null;
  user.lastLogin = new Date();
  await user.save();

  await logActivity(req, {
    admin: user._id,
    action: "Admin login successful",
    module: "auth",
    metadata: { email: user.email, authenticatorUsed: user.twoFactorEnabled },
  });

  return {
    token: generateAccessToken(user._id),
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLogin: user.lastLogin,
    },
  };
};

// @route   POST /api/auth/login
// @desc    Validate the admin password and start the required verification challenge
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!normalizedEmail || !password) {
      return errorResponse(res, 400, "Email and password are required.");
    }

    const user = await User.findOne({ email: normalizedEmail }).select(LOGIN_SECURITY_FIELDS);
    if (
      !user ||
      user.isActive === false ||
      user.isAccountLocked() ||
      !String(user.password || "").startsWith("$2") ||
      !(await user.matchPassword(password))
    ) {
      if (user && !user.isAccountLocked()) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
          user.accountLockedUntil = new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000);
        }
        await user.save();
      }
      return errorResponse(res, 401, "Invalid email or password.");
    }

    // Existing secrets were exposed by the former login-time enrollment flow.
    // Only secrets enrolled by the new authenticated Settings flow use version 2.
    if (user.twoFactorSecret && user.twoFactorSecretVersion !== CURRENT_TOTP_SECRET_VERSION) {
      user.twoFactorEnabled = false;
      user.twoFactorSecret = null;
      user.twoFactorSecretVersion = 0;
      user.backupRecoveryCodes = [];
    }

    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    clearEmailOtp(user);

    if (user.twoFactorEnabled) {
      const { challengeToken } = createChallenge(user, "totp");
      await user.save();
      return successResponse(res, 200, "Authenticator verification required.", {
        challengeToken,
        nextStep: "totp",
      });
    }

    try {
      const challenge = await issueEmailChallenge(user);
      return successResponse(res, 200, "Verification code sent.", challenge);
    } catch (error) {
      console.error("Login verification email could not be sent");
      return errorResponse(res, 503, "Unable to send a verification code. Please try again later.");
    }
  } catch (error) {
    console.error("Login error:", error.message);
    return errorResponse(res, 500, "Server error");
  }
});

// @route   POST /api/auth/verify-totp
// @desc    Verify an enabled Authenticator factor, then start email verification
// @access  Login challenge only
router.post("/verify-totp", async (req, res) => {
  try {
    const { user } = await resolveChallenge(req.body.challengeToken, "totp");
    const code = String(req.body.code || "").trim();

    if (!/^\d{6}$/.test(code)) {
      return errorResponse(res, 400, "Enter a valid 6-digit Authenticator code.");
    }

    let secret;
    try {
      secret = user.getTwoFactorSecret();
    } catch {
      clearLoginChallenge(user);
      await user.save();
      return errorResponse(res, 401, "Authenticator must be reset from Security settings.");
    }

    if (!verifyTotpCode(secret, code)) {
      user.loginChallengeAttempts += 1;
      if (user.loginChallengeAttempts >= MAX_TOTP_ATTEMPTS) {
        clearLoginChallenge(user);
      }
      await user.save();
      return errorResponse(
        res,
        401,
        user.loginChallengeHash
          ? "Invalid Authenticator code."
          : "Too many attempts. Sign in again."
      );
    }

    try {
      const challenge = await issueEmailChallenge(user);
      return successResponse(res, 200, "Verification code sent.", challenge);
    } catch {
      return errorResponse(res, 503, "Unable to send a verification code. Please try again later.");
    }
  } catch {
    return errorResponse(res, 401, "Your login challenge is invalid or expired. Sign in again.");
  }
});

// @route   POST /api/auth/verify-email-otp
// @desc    Verify email ownership and issue the final access JWT
// @access  Login challenge only
router.post("/verify-email-otp", async (req, res) => {
  try {
    const { user, decoded } = await resolveChallenge(req.body.challengeToken, "email_otp");
    const code = String(req.body.code || "").trim();

    if (!/^\d{6}$/.test(code)) {
      return errorResponse(res, 400, "Enter a valid 6-digit verification code.");
    }

    if (
      user.emailOtpPurpose !== "admin_login" ||
      !user.emailOtpExpiresAt ||
      user.emailOtpExpiresAt <= new Date()
    ) {
      clearEmailOtp(user);
      clearLoginChallenge(user);
      await user.save();
      return errorResponse(res, 401, "Verification code expired. Sign in again.");
    }

    const valid = safeEqual(user.emailOtpHash, hashOtp(decoded.jti, code));
    if (!valid) {
      user.emailOtpAttempts += 1;
      if (user.emailOtpAttempts >= MAX_OTP_ATTEMPTS) {
        clearEmailOtp(user);
        clearLoginChallenge(user);
      }
      await user.save();
      return errorResponse(
        res,
        401,
        user.emailOtpHash ? "Invalid verification code." : "Too many attempts. Sign in again."
      );
    }

    const auth = await completeLogin(req, user);
    return successResponse(res, 200, "Login successful.", auth);
  } catch {
    return errorResponse(res, 401, "Your login challenge is invalid or expired. Sign in again.");
  }
});

// @route   POST /api/auth/resend-email-otp
// @desc    Replace the current email OTP after the resend cooldown
// @access  Login challenge only
router.post("/resend-email-otp", async (req, res) => {
  try {
    const { user } = await resolveChallenge(req.body.challengeToken, "email_otp");
    const challenge = await issueEmailChallenge(user, { enforceCooldown: true });
    return successResponse(res, 200, "A new verification code was sent.", challenge);
  } catch (error) {
    if (error.message === "OTP_COOLDOWN") {
      res.set("Retry-After", String(error.retryAfter));
      return errorResponse(
        res,
        429,
        `Please wait ${error.retryAfter} seconds before requesting another code.`
      );
    }
    if (error.message === "INVALID_CHALLENGE") {
      return errorResponse(res, 401, "Your login challenge is invalid or expired. Sign in again.");
    }
    return errorResponse(res, 503, "Unable to send a verification code. Please try again later.");
  }
});

// @route   GET /api/auth/me
// @desc    Get currently logged-in admin user
// @access  Private
router.get("/me", protect, async (req, res) => {
  return successResponse(res, 200, "Authenticated user loaded", { user: req.user });
});

// @route   PUT /api/auth/change-password
// @desc    Change admin password
// @access  Private
router.put("/change-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return errorResponse(res, 400, "Both passwords are required");
    }

    if (newPassword.length < 8) {
      return errorResponse(res, 400, "New password must be at least 8 characters");
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return errorResponse(res, 401, "Current password is incorrect");
    }

    user.password = newPassword;
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    clearEmailOtp(user);
    clearLoginChallenge(user);
    await user.save();
    await logActivity(req, {
      action: "Password changed",
      module: "security",
      metadata: { email: user.email },
    });

    return successResponse(res, 200, "Password updated successfully");
  } catch (error) {
    console.error("Change password error:", error.message);
    return errorResponse(res, 500, "Server error");
  }
});

router.__testables = {
  createChallenge,
  hashOtp,
  maskEmail,
  safeEqual,
  verifyTotpCode,
};

module.exports = router;
