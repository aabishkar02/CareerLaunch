import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";
import { serverState } from "../config/serverState.js";

// ─── Main Auth Middleware ────────────────────────────────────
// Reads accessToken from httpOnly cookie (set by auth controller)
// Attaches decoded user to req.user for all downstream controllers

export const protect = async (req, res, next) => {
  try {
    // 1. Read token from cookie — NOT req.body, NOT Authorization header
    const token = req.cookies.accessToken;


    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. Please log in.",
      });
    }

    // 2. Verify JWT signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Token expired or tampered
      return res.status(401).json({
        success: false,
        message: err.name === "TokenExpiredError"
          ? "Session expired. Please refresh your token."
          : "Invalid token. Please log in again.",
      });
    }

    // 3. Reject tokens issued before this server process started.
    //    Ensures every restart forces all users to log in again.
    if (decoded.iat && decoded.iat < serverState.startedAt) {
      return res.status(401).json({
        success: false,
        message: "Session expired due to server restart. Please log in again.",
      });
    }

    // 5. Check user still exists and is not suspended
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        suspended: true,
        first_name: true,
        last_name: true,
        username: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }

    if (user.suspended) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact support.",
      });
    }

    // 6. Attach to req.user — never mutate req.body
    req.user = {
      userId:    user.id,
      email:     user.email,
      role:      user.role,
      firstName: user.first_name,
      lastName:  user.last_name,
      username:  user.username || null,
    };

    next();

  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ─── Role Guard Middleware ───────────────────────────────────
// Use AFTER protect — checks if the user's role is allowed
// Usage: router.get("/admin/users", protect, authorize("admin"), handler)
// Usage: router.get("/dashboard", protect, authorize("student", "tutor"), handler)

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This route requires role: ${roles.join(" or ")}.`,
      });
    }

    next();
  };
};

// ─── Optional Auth ───────────────────────────────────────────
// For public routes that behave differently when logged in
// Never blocks the request — just attaches user if token exists
// Usage: router.get("/courses", optionalAuth, handler)

export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Pre-restart token — treat as guest
    if (decoded.iat && decoded.iat < serverState.startedAt) {
      req.user = null;
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, suspended: true },
    });

    req.user = user && !user.suspended
      ? { userId: user.id, email: user.email, role: user.role }
      : null;

    next();
  } catch {
    // Invalid token on an optional route — just continue as guest
    req.user = null;
    next();
  }
};