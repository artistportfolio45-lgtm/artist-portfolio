const nodemailer = require("nodemailer");

let transporter;

const getSmtpConfig = () => {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length) {
    throw new Error(`Email service is not configured. Missing: ${missing.join(", ")}`);
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_PORT must be a valid port number");
  }

  return {
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };
};

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport(getSmtpConfig());
  }
  return transporter;
};

const sendLoginOtp = async ({ to, code }) => {
  const siteName = "Artist Portfolio";

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `${siteName} admin verification code`,
    text: `Your ${siteName} admin verification code is ${code}. It expires in 10 minutes. If you did not attempt to sign in, change your password immediately.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1c1c1e">
        <h1 style="font-size:22px;font-weight:500">Admin sign-in verification</h1>
        <p>Use this one-time code to finish signing in:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:700">${code}</p>
        <p>This code expires in 10 minutes. If you did not attempt to sign in, change your password immediately.</p>
      </div>
    `,
  });
};

module.exports = { sendLoginOtp };
