import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";
import { emailService } from "../services/email.service.js";
import { safeError } from "../utils/prodError.js";

// ─── Cookie config ───────────────────────────────────────────

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 15 * 60 * 1000, // 15 minutes
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/v1/auth", // scoped — only sent to auth routes
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ─── Token generators ────────────────────────────────────────

// In your controller — update both generators

const generateAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m", jwtid: crypto.randomUUID() }
  );

const generateRefreshToken = (user) =>
  jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d", jwtid: crypto.randomUUID() }
  );

// ─── Save refresh token to DB ────────────────────────────────

const saveRefreshToken = async (userId, token) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await prisma.refreshToken.upsert({
    where:  { token },
    update: { revoked: false, expires_at: expiresAt, user_id: userId },
    create: { user_id: userId, token, expires_at: expiresAt },
  });
};
// ─── Username generator ───────────────────────────────────────
async function generateUsername(firstName, lastName) {
  const prefix = ((firstName[0] || 'x') + (lastName[0] || 'x')).toLowerCase()
  for (let digits = 4; digits <= 8; digits++) {
    const min = 10 ** (digits - 1)
    const max = 10 ** digits - 1
    for (let attempt = 0; attempt < 50; attempt++) {
      const n         = Math.floor(min + Math.random() * (max - min + 1))
      const candidate = prefix + n
      const taken     = await prisma.user.findUnique({ where: { username: candidate } })
      if (!taken) return candidate
    }
  }
  return null
}

// ─── Register ────────────────────────────────────────────────
// Public — no middleware
// req.user is NOT available here

export const register = async (req, res) => {
  try {
    const { first_name, last_name, phone, role, email, password } = req.body;

    if (!first_name || !last_name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: "first_name, last_name, email, password and role are required",
      });
    }

    // Defense in depth — public registration may NEVER create admins, even if
    // the request bypasses the schema validation middleware somehow.
    if (!["student", "tutor"].includes(role)) {
      return res.status(400).json({ success: false, error: "Role must be student or tutor" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: "An account with this email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 12);

    // Generate unique username with minimal digits needed
    const username = await generateUsername(first_name, last_name)
    if (!username) {
      return res.status(500).json({ success: false, error: 'Could not generate a unique username. Please try again.' })
    }

    const isTutor = role === 'tutor'

    const user = await prisma.user.create({
      data: { first_name, last_name, phone: phone || null, role, email, password_hash, username: username || null, approved: !isTutor },
      select: { id: true, first_name: true, last_name: true, email: true, username: true, role: true, onboarded: true, approved: true, created_at: true },
    });

    if (isTutor) {
      return res.status(201).json({
        success: true,
        message: "Registration successful. Your account is pending admin approval — you'll be notified once approved.",
        data: { user, pendingApproval: true },
      });
    }

    const accessToken  = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await saveRefreshToken(user.id, refreshToken);
    res.cookie("accessToken", accessToken, cookieOptions);
    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    // Fire-and-forget welcome email — never block or fail registration on it.
    emailService.sendStudentWelcome(user.email, user.first_name)
      .catch(err => console.error("Welcome email failed:", err.message));

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: { user },
    });

  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ success: false, error: safeError(error) });
  }
};

// ─── Login ───────────────────────────────────────────────────
// Public — no middleware
// req.user is NOT available here — we must find user manually

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    // Must fetch from DB here — middleware hasn't run, no req.user yet
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    if (user.suspended) {
      return res.status(403).json({ success: false, error: "Account suspended. Contact support." });
    }

    if (user.role === 'tutor' && !user.approved) {
      return res.status(403).json({ success: false, error: "Your tutor account is pending admin approval. You'll receive an email once approved.", pendingApproval: true });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const accessToken  = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await saveRefreshToken(user.id, refreshToken);
    await prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });

    res.cookie("accessToken", accessToken, cookieOptions);
    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    const { password_hash, ...safeUser } = user;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: { user: safeUser },
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── Logout ──────────────────────────────────────────────────
// Protected — uses protect middleware
// req.user.userId available but we only need the refreshToken from body

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    const { userId } = req.user;

    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data:  { revoked: true },
      });
    } else {
      // Fallback — revoke ALL sessions for this user
      await prisma.refreshToken.updateMany({
        where: { user_id: userId },
        data:  { revoked: true },
      });
    }

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", refreshCookieOptions);
    return res.status(200).json({ success: true, message: "Logged out successfully" });

  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── Refresh Token ───────────────────────────────────────────
// Public — no middleware (accessToken is expired, that's why we're here)
// Must verify refreshToken manually and re-fetch user

export const refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: "No refresh token. Please log in again." });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: "Invalid or expired refresh token" });
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });

    if (!stored) {
      return res.status(401).json({ success: false, error: "Refresh token not found" });
    }

    // Reuse detected — nuke all sessions for this user
    if (stored.revoked) {
      await prisma.refreshToken.updateMany({
        where: { user_id: stored.user_id },
        data:  { revoked: true },
      });
      return res.status(401).json({
        success: false,
        error: "Token reuse detected. All sessions terminated.",
      });
    }

    if (new Date() > stored.expires_at) {
      return res.status(401).json({ success: false, error: "Refresh token has expired" });
    }

    // Must re-fetch user here — no middleware, no req.user
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    // Rotate tokens
    await prisma.refreshToken.update({ where: { token: refreshToken }, data: { revoked: true } });

    const newAccessToken  = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await saveRefreshToken(user.id, newRefreshToken);
    res.cookie("accessToken", newAccessToken, cookieOptions);
    res.cookie("refreshToken", newRefreshToken, refreshCookieOptions);

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
    });

  } catch (error) {
    console.error("Refresh error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── Forgot Password ─────────────────────────────────────────
// Public — no middleware

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const resetToken = jwt.sign(
        { userId: user.id, purpose: "password_reset" },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
      );
      // FRONTEND_URL may be a comma-separated CORS list — link to the first origin
      const appUrl = (process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim();
      const resetLink = `${appUrl}/reset-password?token=${resetToken}`;
      await emailService.sendPasswordReset(user.email, resetLink);
    }

    // Always 200 — never reveal if email exists
    return res.status(200).json({
      success: true,
      message: "If an account with that email exists, a reset link has been sent",
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── Reset Password ───────────────────────────────────────────
// Public — NO protect middleware. The user is logged out; they arrive from an
// email link carrying a single-purpose signed token. We verify that token here
// instead of relying on a session cookie (which they don't have).

export const resetPassword = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: "Reset token is required" });
    }
    if (!password || !confirmPassword) {
      return res.status(400).json({ success: false, error: "password and confirmPassword are required" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: "Passwords do not match" });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }

    // Verify the emailed token and ensure it was minted specifically for resets.
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ success: false, error: "This reset link is invalid or has expired. Please request a new one." });
    }

    if (decoded.purpose !== "password_reset" || !decoded.userId) {
      return res.status(400).json({ success: false, error: "Invalid reset token." });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, updated_at: true } });
    if (!user) {
      return res.status(400).json({ success: false, error: "Invalid reset token." });
    }

    // One-time-use: if the user record was updated after this token was issued the
    // token has already been used (password was reset) — reject it.
    if (decoded.iat && user.updated_at && user.updated_at.getTime() / 1000 > decoded.iat) {
      return res.status(400).json({ success: false, error: "This reset link has already been used. Please request a new one." });
    }

    const password_hash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password_hash } });

    // Revoke every existing session — a password reset must invalidate old logins.
    await prisma.refreshToken.updateMany({
      where: { user_id: user.id },
      data:  { revoked: true },
    });

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", refreshCookieOptions);

    return res.status(200).json({
      success: true,
      message: "Password reset successful. Please log in with your new password.",
    });

  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ success: false, error: safeError(error) });
  }
};

// ─── Change Password ──────────────────────────────────────────
// Protected — uses protect middleware
// req.user is available — NO need to fetch user by email, use req.user.userId
// But we still need password_hash so one DB fetch is needed

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const { userId } = req.user; // ← injected by protect middleware, no DB call needed

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, error: "All three password fields are required" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: "New passwords do not match" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }

    // One DB call needed — middleware doesn't fetch password_hash (security)
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { password_hash: true },     // only fetch what we need
    });

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, error: "Current password is incorrect" });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { password_hash } });

    await prisma.refreshToken.updateMany({ where: { user_id: userId }, data: { revoked: true } });
    res.clearCookie("accessToken", cookieOptions);

    return res.status(200).json({
      success: true,
      message: "Password changed. Please log in again.",
    });

  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── Get Me ───────────────────────────────────────────────────
// Protected — uses protect middleware
export const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: {
        id: true, first_name: true, last_name: true, username: true,
        email: true, role: true, bio: true, phone: true,
        avatar_url: true, timezone: true, onboarded: true, approved: true,
      },
    })
    if (!user) return res.status(404).json({ success: false, error: 'User not found' })
    return res.status(200).json({ success: true, data: { user } })
  } catch (error) {
    console.error("GetMe error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ─── Update own profile ───────────────────────────────────────
// PATCH /api/v1/auth/me
// Protected — any role
export const updateMe = async (req, res) => {
  try {
    const userId = req.user.userId
    const { first_name, last_name, email, bio, phone, timezone } = req.body

    const data = {}
    if (first_name !== undefined) data.first_name = first_name.trim()
    if (last_name  !== undefined) data.last_name  = last_name.trim()
    if (bio        !== undefined) data.bio        = bio
    if (phone      !== undefined) data.phone      = phone
    if (timezone   !== undefined) data.timezone   = timezone

    if (email !== undefined) {
      const existing = await prisma.user.findFirst({ where: { email, id: { not: userId } } })
      if (existing) {
        return res.status(409).json({ success: false, error: 'Email already in use by another account' })
      }
      data.email = email.trim().toLowerCase()
    }

    if (timezone !== undefined) {
      try {
        // Validate against the runtime's supported IANA timezone list.
        const supported = Intl.supportedValuesOf('timeZone')
        if (!supported.includes(timezone)) {
          return res.status(400).json({ success: false, error: 'Invalid timezone. Must be a valid IANA timezone name (e.g. "America/New_York").' })
        }
      } catch {
        // Intl.supportedValuesOf not available in older Node — skip validation
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields provided to update' })
    }

    const user = await prisma.user.update({
      where:  { id: userId },
      data,
      select: {
        id: true, first_name: true, last_name: true,
        email: true, role: true, bio: true, phone: true,
        avatar_url: true, timezone: true, onboarded: true, username: true,
      },
    })

    return res.json({ success: true, data: { user } })
  } catch (e) {
    console.error('updateMe error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Google OAuth — not yet implemented ──────────────────────
export const googleAuth = (_req, res) => {
  return res.status(501).json({ success: false, error: 'Google OAuth is not yet implemented.' });
};

export default { register, login, logout, refresh, forgotPassword, resetPassword, changePassword, getMe, updateMe, googleAuth };