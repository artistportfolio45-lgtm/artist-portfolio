const assert = require("node:assert/strict");
const test = require("node:test");

const emailService = require("../services/emailService");

const originalEnvironment = {
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
  GMAIL_SENDER: process.env.GMAIL_SENDER,
};

const setGmailEnvironment = () => {
  process.env.GMAIL_CLIENT_ID = "client-id";
  process.env.GMAIL_CLIENT_SECRET = "client-secret";
  process.env.GMAIL_REFRESH_TOKEN = "refresh-token";
  process.env.GMAIL_SENDER = "artistportfolio45@gmail.com";
};

test.beforeEach(() => {
  setGmailEnvironment();
  emailService.__testables.resetForTests();
});

test.after(() => {
  Object.entries(originalEnvironment).forEach(([name, value]) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
});

test("Gmail API delivery exchanges the refresh token and sends a base64url RFC email", async () => {
  const calls = [];
  emailService.__testables.setFetchImplementation(async (url, options) => {
    calls.push({ url, options });
    if (url === emailService.__testables.GMAIL_TOKEN_URL) {
      return { ok: true, json: async () => ({ access_token: "access-token", expires_in: 3600 }) };
    }
    return { ok: true, json: async () => ({ id: "gmail-message-id" }) };
  });

  const result = await emailService.sendLoginOtp({ to: "admin@example.com", code: "123456" });
  assert.deepEqual(result, { id: "gmail-message-id" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, emailService.__testables.GMAIL_TOKEN_URL);
  assert.match(String(calls[0].options.body), /grant_type=refresh_token/);
  assert.equal(calls[1].url, emailService.__testables.GMAIL_SEND_URL);
  assert.equal(calls[1].options.headers.Authorization, "Bearer access-token");

  const raw = JSON.parse(calls[1].options.body).raw;
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /From: Artist Portfolio <artistportfolio45@gmail\.com>/);
  assert.match(decoded, /To: admin@example\.com/);
  assert.match(decoded, /123456/);
});

test("Gmail delivery failures are prompt 503-class errors", async () => {
  emailService.__testables.setFetchImplementation(async () => {
    throw new Error("network unavailable");
  });

  await assert.rejects(
    () => emailService.sendLoginOtp({ to: "admin@example.com", code: "123456" }),
    (error) => error instanceof emailService.EmailDeliveryError && error.status === 503
  );
});

test("Gmail configuration rejects a missing or incorrect sender", () => {
  delete process.env.GMAIL_REFRESH_TOKEN;
  assert.throws(() => emailService.validateGmailConfig(), /GMAIL_REFRESH_TOKEN/);

  setGmailEnvironment();
  process.env.GMAIL_SENDER = "another-account@gmail.com";
  assert.throws(() => emailService.validateGmailConfig(), /artistportfolio45@gmail\.com/);
});
