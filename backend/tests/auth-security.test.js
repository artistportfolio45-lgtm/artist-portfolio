const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");

process.env.JWT_SECRET = "test-only-jwt-secret-that-is-long-and-random";
process.env.TOTP_ENCRYPTION_KEY = "test-only-totp-key-that-is-long-and-random";

const authRouter = require("../routes/auth");
const securityRouter = require("../routes/security");
const { protect } = require("../middleware/auth");
const { invalidateLegacyTwoFactorSecrets } = require("../utils/adminSeed");
const { isPublicReadRoute } = require("../middleware/rateLimiter");
const User = require("../models/User");

const routePaths = (router) =>
  router.stack.filter((layer) => layer.route).map((layer) => layer.route.path);

test("auth routes expose verification steps without enrollment routes", () => {
  const paths = routePaths(authRouter);
  assert.ok(paths.includes("/login"));
  assert.ok(paths.includes("/verify-totp"));
  assert.ok(paths.includes("/verify-email-otp"));
  assert.ok(paths.includes("/resend-email-otp"));
  assert.equal(paths.includes("/2fa/setup"), false);
});

test("Authenticator enrollment routes exist only behind the security router", () => {
  const paths = routePaths(securityRouter);
  assert.ok(paths.includes("/2fa/setup"));
  assert.ok(paths.includes("/2fa/enable"));
  assert.ok(paths.includes("/2fa/disable"));
});

test("login UI and login route contain no QR or manual-key enrollment output", () => {
  const loginPage = fs.readFileSync(
    path.resolve(__dirname, "../../frontend/src/pages/admin/LoginPage.jsx"),
    "utf8"
  );
  const loginRoute = fs.readFileSync(path.resolve(__dirname, "../routes/auth.js"), "utf8");

  for (const forbidden of ["qrCode", "manualKey", "otpauth_url", "generateSecret"]) {
    assert.equal(loginPage.includes(forbidden), false);
    assert.equal(loginRoute.includes(forbidden), false);
  }
});

test("email destinations are masked", () => {
  assert.equal(authRouter.__testables.maskEmail("artist5@gmail.com"), "a*****5@gmail.com");
  assert.equal(authRouter.__testables.maskEmail("a@example.com"), "a***@example.com");
});

test("OTP hashes are challenge-bound and never equal the plain OTP", () => {
  const first = authRouter.__testables.hashOtp("challenge-a", "123456");
  const second = authRouter.__testables.hashOtp("challenge-b", "123456");

  assert.notEqual(first, "123456");
  assert.notEqual(first, second);
  assert.equal(authRouter.__testables.safeEqual(first, first), true);
  assert.equal(authRouter.__testables.safeEqual(first, second), false);
});

test("temporary login challenges are short-lived and scoped away from admin access", async () => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    loginChallengeHash: null,
    loginChallengePurpose: null,
    loginChallengeAttempts: 99,
  };
  const { challengeToken } = authRouter.__testables.createChallenge(user, "email_otp");
  const decoded = jwt.verify(challengeToken, process.env.JWT_SECRET);

  assert.equal(decoded.type, "login_challenge");
  assert.equal(decoded.stage, "email_otp");
  assert.ok(decoded.exp - decoded.iat <= 10 * 60);
  assert.equal(user.loginChallengeAttempts, 0);

  const req = { headers: { authorization: `Bearer ${challengeToken}` } };
  const response = { statusCode: 200, body: null };
  const res = {
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(body) {
      response.body = body;
      return this;
    },
  };
  let nextCalled = false;
  await protect(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 401);
});

test("TOTP verification accepts only a current six-digit code", () => {
  const secret = speakeasy.generateSecret({ length: 20 }).base32;
  const code = speakeasy.totp({ secret, encoding: "base32" });

  assert.equal(authRouter.__testables.verifyTotpCode(secret, code), true);
  assert.equal(authRouter.__testables.verifyTotpCode(secret, "00000"), false);
  assert.equal(authRouter.__testables.verifyTotpCode(secret, "not-a-code"), false);
});

test("active and pending TOTP secrets are encrypted in the user document", () => {
  const user = new User({
    email: "admin@example.com",
    password: "not-saved-in-this-test",
  });

  user.setTwoFactorSecret("ACTIVESECRET");
  user.setPendingTwoFactorSecret("PENDINGSECRET");

  assert.notEqual(user.twoFactorSecret, "ACTIVESECRET");
  assert.notEqual(user.pendingTwoFactorSecret, "PENDINGSECRET");
  assert.equal(user.getTwoFactorSecret(), "ACTIVESECRET");
  assert.equal(user.getPendingTwoFactorSecret(), "PENDINGSECRET");
});

test("recovery codes are stored as hashes and are single-use", async () => {
  const user = new User({
    email: "admin@example.com",
    password: "not-saved-in-this-test",
  });
  const [code] = await user.generateBackupRecoveryCodes(1);

  assert.notEqual(user.backupRecoveryCodes[0].codeHash, code);
  assert.equal(await user.useBackupRecoveryCode(code), true);
  assert.equal(await user.useBackupRecoveryCode(code), false);
});

test("legacy Authenticator secrets are invalidated without touching versioned enrollments", async () => {
  const originalUpdateMany = User.updateMany;
  let capturedFilter;
  let capturedUpdate;
  User.updateMany = async (filter, update) => {
    capturedFilter = filter;
    capturedUpdate = update;
    return { modifiedCount: 1 };
  };

  try {
    const modified = await invalidateLegacyTwoFactorSecrets({
      logger: { warn() {} },
    });
    assert.equal(modified, 1);
    assert.deepEqual(capturedFilter.twoFactorSecretVersion, { $ne: 2 });
    assert.equal(capturedUpdate.$set.twoFactorEnabled, false);
    assert.equal(capturedUpdate.$set.twoFactorSecret, null);
    assert.equal(capturedUpdate.$set.pendingTwoFactorSecret, null);
  } finally {
    User.updateMany = originalUpdateMany;
  }
});

test("public read routes are not throttled by the general API limiter", () => {
  for (const pathName of ["/settings", "/profile", "/about", "/public-data", "/artworks", "/artworks/categories", "/artworks/64f0f0f0f0f0f0f0f0f0f0f0", "/artworks/64f0f0f0f0f0f0f0f0f0f0f0/neighbors"]) {
    assert.equal(isPublicReadRoute({ method: "GET", path: pathName }), true, pathName);
  }

  for (const request of [
    { method: "GET", path: "/artworks/manage" },
    { method: "DELETE", path: "/artworks/64f0f0f0f0f0f0f0f0f0f0f0" },
    { method: "POST", path: "/artworks/bulk" },
    { method: "GET", path: "/activity" },
  ]) {
    assert.equal(isPublicReadRoute(request), false, `${request.method} ${request.path}`);
  }
});

test("startup admin seeding cannot reset 2FA without explicit confirmation", () => {
  const serverSource = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  assert.match(serverSource, /CONFIRM_RESET_ADMIN_2FA === "RESET_ADMIN_2FA"/);
  assert.match(serverSource, /CONFIRM_PRODUCTION_ADMIN_SEED === "SEED_ADMIN"/);
  assert.match(serverSource, /SEED_ADMIN_ON_START was ignored in production/);
  assert.match(serverSource, /RESET_ADMIN_2FA_ON_START was ignored/);
  assert.match(serverSource, /resetTwoFactor: resetAdminTwoFactor/);
});
