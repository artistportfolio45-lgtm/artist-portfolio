const express = require("express");
const qrcode = require("qrcode");
const speakeasy = require("speakeasy");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { logActivity } = require("../middleware/activityLogger");

const router = express.Router();
const TOTP_SETUP_EXPIRY_MS = 15 * 60 * 1000;
const CURRENT_TOTP_SECRET_VERSION = 2;

const successResponse = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...data,
  });
};

const errorResponse = (res, statusCode, message, errors = []) => {
  return res.status(statusCode).json({ success: false, message, errors });
};

const getUserWithSecurityFields = (id) => {
  return User.findById(id).select(
    "+twoFactorSecret +pendingTwoFactorSecret +pendingTwoFactorExpiresAt +twoFactorSecretVersion +backupRecoveryCodes"
  );
};

const verifyTotpCode = (user, token) => {
  let secret;
  try {
    secret = user.getTwoFactorSecret();
  } catch (error) {
    return false;
  }
  if (!secret || !token) return false;

  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: String(token).trim(),
    window: 1,
  });
};

const verifyPendingTotpCode = (user, token) => {
  let secret;
  try {
    secret = user.getPendingTwoFactorSecret();
  } catch {
    return false;
  }
  if (!secret || !token) return false;

  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: String(token).trim(),
    window: 1,
  });
};

// @route   GET /api/security/status
// @desc    Get current admin security status
// @access  Private
router.get("/status", protect, async (req, res) => {
  try {
    const user = await getUserWithSecurityFields(req.user._id);
    const remainingRecoveryCodes = (user.backupRecoveryCodes || []).filter((code) => !code.usedAt).length;

    return successResponse(res, 200, "Security status loaded", {
      security: {
        email: user.email,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        remainingRecoveryCodes,
        lastLogin: user.lastLogin,
        lastPasswordChanged: user.lastPasswordChanged,
        accountLockedUntil: user.accountLockedUntil,
      },
    });
  } catch (error) {
    console.error("Security status error:", error);
    return errorResponse(res, 500, "Server error");
  }
});

// @route   POST /api/security/2fa/setup
// @desc    Start 2FA setup after confirming current password
// @access  Private
router.post("/2fa/setup", protect, async (req, res) => {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return errorResponse(res, 400, "Current password is required");
    }

    const user = await getUserWithSecurityFields(req.user._id);
    const passwordMatches = await user.matchPassword(currentPassword);

    if (!passwordMatches) {
      return errorResponse(res, 401, "Current password is incorrect");
    }

    if (user.twoFactorEnabled) {
      return errorResponse(res, 400, "Two-factor authentication is already enabled");
    }

    const secret = speakeasy.generateSecret({
      name: `Artist Portfolio (${user.email})`,
      issuer: "Artist Portfolio",
      length: 20,
    });

    user.setPendingTwoFactorSecret(secret.base32);
    user.pendingTwoFactorExpiresAt = new Date(Date.now() + TOTP_SETUP_EXPIRY_MS);
    await user.save();
    await logActivity(req, {
      action: "Two-factor setup started",
      module: "security",
      metadata: { email: user.email },
    });

    const qrCode = await qrcode.toDataURL(secret.otpauth_url);

    return successResponse(res, 200, "Two-factor setup started", {
      qrCode,
      manualKey: secret.base32,
    });
  } catch (error) {
    console.error("Two-factor setup error:", error);
    return errorResponse(res, 500, "Server error");
  }
});

// @route   POST /api/security/2fa/enable
// @desc    Confirm setup code, enable 2FA, and issue recovery codes
// @access  Private
const enableTwoFactor = async (req, res) => {
  try {
    const { token } = req.body;

    if (!/^\d{6}$/.test(String(token || "").trim())) {
      return errorResponse(res, 400, "A valid 6-digit Authenticator code is required");
    }

    const user = await getUserWithSecurityFields(req.user._id);

    if (user.twoFactorEnabled) {
      return errorResponse(res, 400, "Two-factor authentication is already enabled");
    }

    if (!user.pendingTwoFactorSecret || !user.pendingTwoFactorExpiresAt) {
      return errorResponse(res, 400, "Start two-factor setup before verifying a code");
    }

    if (user.pendingTwoFactorExpiresAt <= new Date()) {
      user.pendingTwoFactorSecret = null;
      user.pendingTwoFactorExpiresAt = null;
      await user.save();
      return errorResponse(res, 400, "Authenticator setup expired. Start setup again.");
    }

    if (!verifyPendingTotpCode(user, token)) {
      return errorResponse(res, 400, "Invalid authenticator code");
    }

    const pendingSecret = user.getPendingTwoFactorSecret();
    const recoveryCodes = await user.generateBackupRecoveryCodes();
    user.setTwoFactorSecret(pendingSecret);
    user.pendingTwoFactorSecret = null;
    user.pendingTwoFactorExpiresAt = null;
    user.twoFactorSecretVersion = CURRENT_TOTP_SECRET_VERSION;
    user.twoFactorEnabled = true;
    await user.save();
    await logActivity(req, {
      action: "Two-factor authentication enabled",
      module: "security",
      metadata: { email: user.email, recoveryCodeCount: recoveryCodes.length },
    });

    return successResponse(res, 200, "Two-factor authentication enabled", {
      recoveryCodes,
    });
  } catch (error) {
    console.error("Two-factor verify error:", error);
    return errorResponse(res, 500, "Server error");
  }
};

router.post("/2fa/enable", protect, enableTwoFactor);
router.post("/2fa/verify", protect, enableTwoFactor);

// @route   POST /api/security/2fa/disable
// @desc    Disable 2FA after password and authenticator/recovery verification
// @access  Private
router.post("/2fa/disable", protect, async (req, res) => {
  try {
    const { currentPassword, token, recoveryCode } = req.body;

    if (!currentPassword) {
      return errorResponse(res, 400, "Current password is required");
    }

    const user = await getUserWithSecurityFields(req.user._id);
    const passwordMatches = await user.matchPassword(currentPassword);

    if (!passwordMatches) {
      return errorResponse(res, 401, "Current password is incorrect");
    }

    if (!user.twoFactorEnabled) {
      return errorResponse(res, 400, "Two-factor authentication is not enabled");
    }

    const codeValid = token ? verifyTotpCode(user, token) : false;
    const recoveryValid = !codeValid && recoveryCode ? await user.useBackupRecoveryCode(recoveryCode) : false;

    if (!codeValid && !recoveryValid) {
      return errorResponse(res, 401, "Valid authenticator or recovery code is required");
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.pendingTwoFactorSecret = null;
    user.pendingTwoFactorExpiresAt = null;
    user.twoFactorSecretVersion = 0;
    user.backupRecoveryCodes = [];
    await user.save();
    await logActivity(req, {
      action: "Two-factor authentication disabled",
      module: "security",
      metadata: { email: user.email, usedRecoveryCode: Boolean(recoveryValid) },
    });

    return successResponse(res, 200, "Two-factor authentication disabled");
  } catch (error) {
    console.error("Two-factor disable error:", error);
    return errorResponse(res, 500, "Server error");
  }
});

// @route   POST /api/security/recovery-codes/regenerate
// @desc    Replace backup recovery codes
// @access  Private
router.post("/recovery-codes/regenerate", protect, async (req, res) => {
  try {
    const { currentPassword, token } = req.body;

    if (!currentPassword || !token) {
      return errorResponse(res, 400, "Current password and authenticator code are required");
    }

    const user = await getUserWithSecurityFields(req.user._id);
    const passwordMatches = await user.matchPassword(currentPassword);

    if (!passwordMatches) {
      return errorResponse(res, 401, "Current password is incorrect");
    }

    if (!user.twoFactorEnabled) {
      return errorResponse(res, 400, "Enable two-factor authentication before generating recovery codes");
    }

    if (!verifyTotpCode(user, token)) {
      return errorResponse(res, 401, "Invalid authenticator code");
    }

    const recoveryCodes = await user.generateBackupRecoveryCodes();
    await user.save();
    await logActivity(req, {
      action: "Recovery codes regenerated",
      module: "security",
      metadata: { email: user.email, recoveryCodeCount: recoveryCodes.length },
    });

    return successResponse(res, 200, "Recovery codes regenerated", { recoveryCodes });
  } catch (error) {
    console.error("Recovery code regeneration error:", error);
    return errorResponse(res, 500, "Server error");
  }
});

module.exports = router;
