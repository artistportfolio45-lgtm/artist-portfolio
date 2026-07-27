const mongoose = require("mongoose");

const getDatabaseName = (uri) => {
  try {
    const parsed = new URL(uri);
    return parsed.pathname.replace(/^\//, "").split("?")[0];
  } catch {
    return "";
  }
};

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MongoDB Connection Error: MONGO_URI is not set in .env");
    process.exit(1);
  }

  try {
    const dbName = getDatabaseName(process.env.MONGO_URI);
    if (process.env.NODE_ENV === "production" && dbName !== "artistPortfolio") {
      throw new Error(`MONGO_URI must target /artistPortfolio in production; current database is "${dbName || "unknown"}"`);
    }

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);

    if (error.message.includes("querySrv")) {
      console.error(
        "Atlas SRV lookup failed. Check your internet connection, DNS/VPN/firewall settings, and Atlas Network Access IP allowlist."
      );
      console.error(
        "If DNS SRV is blocked on this network, use the standard mongodb:// connection string from Atlas instead of mongodb+srv://."
      );
    }

    process.exit(1);
  }
};

module.exports = connectDB;
