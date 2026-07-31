const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized - no token",
      errors: [],
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type === "login_challenge" || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized - token invalid",
        errors: [],
      });
    }

    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ success: false, message: "User not found", errors: [] });
    }

    if (req.user.isActive === false) {
      return res.status(401).json({ success: false, message: "User inactive", errors: [] });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized - token invalid",
      errors: [],
    });
  }
};

module.exports = { protect };
