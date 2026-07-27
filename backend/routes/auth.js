const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const qrcode = require("qrcode");
const speakeasy = require("speakeasy");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { logActivity } = require("../middleware/activityLogger");

const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS || 5);
const ACCOUNT_LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES || 15);

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

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const verifyTotpCode = (secret, token) => {
  if (!secret || !token) return false;

  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: String(token).trim(),
    window: 1,
  });
};

// @route   POST /api/auth/login
// @desc    Admin login with failed-attempt tracking and lockout
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, password, twoFactorCode, recoveryCode } = req.body;

    if (!email || !password) {
      return errorResponse(res, 400, "Email and password are required");
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
      "+twoFactorSecret +backupRecoveryCodes"
    );
    if (!user) {
      await logActivity(req, {
        action: "Failed login for unknown email",
        module: "auth",
        metadata: { email: email.toLowerCase().trim() },
      });
      return errorResponse(res, 401, "Invalid credentials");
    }

    if (user.isAccountLocked()) {
      return errorResponse(
        res,
        423,
        `Account temporarily locked. Try again after ${user.accountLockedUntil.toLocaleString()}.`
      );
    }

    if (user.accountLockedUntil) {
      user.failedLoginAttempts = 0;
      user.accountLockedUntil = null;
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.accountLockedUntil = new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000);
      }

      await user.save();
      await logActivity(req, {
        admin: user._id,
        action: user.accountLockedUntil ? "Account locked after failed logins" : "Failed login",
        module: "auth",
        metadata: { email: user.email, failedLoginAttempts: user.failedLoginAttempts },
      });
      return errorResponse(res, 401, "Invalid credentials");
    }

    if (!user.twoFactorEnabled) {
      if (!twoFactorCode) {
        const secret = speakeasy.generateSecret({
          name: `Artist Portfolio (${user.email})`,
          issuer: "Artist Portfolio",
          length: 20,
        });

        user.setTwoFactorSecret(secret.base32);
        await user.save();
        const qrCode = await qrcode.toDataURL(secret.otpauth_url);

        await logActivity(req, {
          admin: user._id,
          action: "Initial two-factor setup requested",
          module: "auth",
          metadata: { email: user.email },
        });

        return successResponse(res, 200, "Two-factor setup required", {
          requiresTwoFactor: true,
          setupRequired: true,
          qrCode,
          manualKey: secret.base32,
          user: { email: user.email },
        });
      }

      let secret;
      try {
        secret = user.getTwoFactorSecret();
      } catch (error) {
        user.twoFactorSecret = null;
        await user.save();
        return errorResponse(res, 401, "Two-factor setup expired. Sign in again to restart setup.");
      }

      if (!verifyTotpCode(secret, twoFactorCode)) {
        await logActivity(req, {
          admin: user._id,
          action: "Failed initial two-factor setup verification",
          module: "auth",
          metadata: { email: user.email },
        });
        return errorResponse(res, 401, "Invalid two-factor authentication code");
      }

      await user.generateBackupRecoveryCodes();
      user.twoFactorEnabled = true;
    } else {
      const hasAuthenticatorCode = Boolean(twoFactorCode);
      const hasRecoveryCode = Boolean(recoveryCode);

      if (!hasAuthenticatorCode && !hasRecoveryCode) {
        await logActivity(req, {
          admin: user._id,
          action: "Two-factor challenge requested",
          module: "auth",
          metadata: { email: user.email },
        });
        return successResponse(res, 200, "Two-factor authentication required", {
          requiresTwoFactor: true,
          user: { email: user.email },
        });
      }

      let secondFactorValid = false;

      if (hasAuthenticatorCode) {
        try {
          const secret = user.getTwoFactorSecret();
          secondFactorValid = verifyTotpCode(secret, twoFactorCode);
        } catch (error) {
          await logActivity(req, {
            admin: user._id,
            action: "Two-factor secret could not be decrypted",
            module: "auth",
            metadata: { email: user.email },
          });
          return errorResponse(
            res,
            401,
            "Two-factor setup must be reset by running the admin seed reset command"
          );
        }
      }

      if (!secondFactorValid && hasRecoveryCode) {
        secondFactorValid = await user.useBackupRecoveryCode(recoveryCode);
      }

      if (!secondFactorValid) {
        await user.save();
        await logActivity(req, {
          admin: user._id,
          action: "Failed two-factor login",
          module: "auth",
          metadata: { email: user.email, usedRecoveryCode: hasRecoveryCode },
        });
        return errorResponse(res, 401, "Invalid two-factor authentication code");
      }
    }

    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    user.lastLogin = new Date();
    await user.save();
    await logActivity(req, {
      admin: user._id,
      action: "Admin login successful",
      module: "auth",
      metadata: { email: user.email, twoFactorUsed: user.twoFactorEnabled },
    });

    const token = generateToken(user._id);
    const userData = {
      id: user._id,
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLogin: user.lastLogin,
    };

    return successResponse(res, 200, "Login successful", { token, user: userData });
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse(res, 500, "Server error");
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
    await user.save();
    await logActivity(req, {
      action: "Password changed",
      module: "security",
      metadata: { email: user.email },
    });

    return successResponse(res, 200, "Password updated successfully");
  } catch (error) {
    console.error("Change password error:", error);
    return errorResponse(res, 500, "Server error");
  }
});

// @route   POST /api/auth/seed
// @desc    Seed the one-time admin user
// @access  Public, but only creates an admin when none exists
router.post("/seed", async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return errorResponse(res, 400, "Admin already exists");
    }

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      return errorResponse(res, 500, "ADMIN_EMAIL and ADMIN_PASSWORD must be configured before seeding");
    }

    if (password.length < 8) {
      return errorResponse(res, 400, "Seed password must be at least 8 characters");
    }

    const admin = await User.create({ email, password, role: "admin" });
    await logActivity(req, {
      admin: admin._id,
      action: "Initial admin seeded",
      module: "auth",
      metadata: { email: admin.email },
    });

    return successResponse(res, 201, "Admin created", {
      user: { id: admin._id, email: admin.email, role: admin.role },
    });
  } catch (error) {
    console.error("Seed error:", error);
    return errorResponse(res, 500, "Server error");
  }
});

module.exports = router;
