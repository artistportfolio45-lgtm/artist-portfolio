const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_SENDER = "artistportfolio45@gmail.com";
const REQUEST_TIMEOUT_MS = 8_000;

let cachedAccessToken = null;
let fetchImplementation = (...args) => fetch(...args);

class EmailDeliveryError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "EmailDeliveryError";
    this.status = 503;
    this.cause = cause;
  }
}

const validateGmailConfig = () => {
  const required = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER"];
  const missing = required.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length) {
    throw new Error(`Gmail API is not configured. Missing: ${missing.join(", ")}`);
  }

  if (process.env.GMAIL_SENDER.trim().toLowerCase() !== GMAIL_SENDER) {
    throw new Error(`GMAIL_SENDER must be ${GMAIL_SENDER}`);
  }

  return {
    clientId: process.env.GMAIL_CLIENT_ID.trim(),
    clientSecret: process.env.GMAIL_CLIENT_SECRET.trim(),
    refreshToken: process.env.GMAIL_REFRESH_TOKEN.trim(),
    sender: GMAIL_SENDER,
  };
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImplementation(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw new EmailDeliveryError("Gmail API request failed", error);
  } finally {
    clearTimeout(timeout);
  }
};

const getAccessToken = async () => {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now) {
    return cachedAccessToken.value;
  }

  const config = validateGmailConfig();
  const response = await fetchWithTimeout(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new EmailDeliveryError(`Gmail OAuth token request failed (${response.status})`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!payload.access_token || !Number.isFinite(Number(payload.expires_in))) {
    throw new EmailDeliveryError("Gmail OAuth token response was invalid");
  }

  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: now + Math.max(0, Number(payload.expires_in) - 60) * 1000,
  };
  return cachedAccessToken.value;
};

const encodeEmail = ({ to, subject, html }) => {
  const config = validateGmailConfig();
  const raw = [
    `From: Artist Portfolio <${config.sender}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
};

const sendLoginOtp = async ({ to, code }) => {
  if (!to || !code) throw new EmailDeliveryError("Email recipient and verification code are required");
  const siteName = "Artist Portfolio";
  const subject = `${siteName} admin verification code`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1c1c1e">
      <h1 style="font-size:22px;font-weight:500">Admin sign-in verification</h1>
      <p>Use this one-time code to finish signing in:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700">${code}</p>
      <p>This code expires in 10 minutes. If you did not attempt to sign in, change your password immediately.</p>
    </div>
  `;

  const accessToken = await getAccessToken();
  const response = await fetchWithTimeout(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodeEmail({ to, subject, html }) }),
  });

  if (!response.ok) {
    throw new EmailDeliveryError(`Gmail send request failed (${response.status})`);
  }

  return response.json().catch(() => ({}));
};

const resetForTests = () => {
  cachedAccessToken = null;
  fetchImplementation = (...args) => fetch(...args);
};

module.exports = {
  EmailDeliveryError,
  sendLoginOtp,
  validateGmailConfig,
  __testables: {
    GMAIL_SEND_URL,
    GMAIL_TOKEN_URL,
    encodeEmail,
    getAccessToken,
    resetForTests,
    setFetchImplementation: (implementation) => { fetchImplementation = implementation; },
  },
};
