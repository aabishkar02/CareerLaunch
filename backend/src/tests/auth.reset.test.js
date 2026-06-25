import "dotenv/config";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../config/db.js";

// Covers the password-reset flow that was previously broken (it required a
// logged-in session via `protect`, so a user who forgot their password could
// never complete it). It now verifies the emailed single-purpose token instead.

const user = {
  first_name: "Reset",
  last_name: "Flow",
  email: "reset.flow.test@example.com",
  password: "OldPassword123!",
  role: "student",
};

let userId = "";

// Mint a token exactly like forgotPassword does.
const resetTokenFor = (id, overrides = {}) =>
  jwt.sign({ userId: id, purpose: "password_reset", ...overrides }, process.env.JWT_SECRET, { expiresIn: "15m" });

beforeAll(async () => {
  await prisma.refreshToken.deleteMany({ where: { user: { email: user.email } } });
  await prisma.user.deleteMany({ where: { email: user.email } });

  const res = await request(app).post("/api/v1/auth/register").send(user);
  userId = res.body.data.user.id;
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({ where: { user: { email: user.email } } });
  await prisma.user.deleteMany({ where: { email: user.email } });
  await prisma.$disconnect();
});

describe("POST /api/v1/auth/reset-password", () => {

  it("should reject a missing token (schema 400)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ password: "NewPassword123!", confirmPassword: "NewPassword123!" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should reject mismatched passwords (schema 400)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: resetTokenFor(userId), password: "NewPassword123!", confirmPassword: "Different123!" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should reject a garbage/invalid token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "not.a.real.token", password: "NewPassword123!", confirmPassword: "NewPassword123!" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should reject a validly-signed token that is NOT a reset token", async () => {
    // e.g. an access-token-shaped token without purpose:'password_reset'
    const wrongPurpose = jwt.sign({ userId, role: "student" }, process.env.JWT_SECRET, { expiresIn: "15m" });
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: wrongPurpose, password: "NewPassword123!", confirmPassword: "NewPassword123!" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should reset the password with a valid token, then allow login with the new password only", async () => {
    const newPassword = "BrandNewPass456!";

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: resetTokenFor(userId), password: newPassword, confirmPassword: newPassword });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Old password must no longer work
    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);

    // New password works
    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: newPassword });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.success).toBe(true);
  });

});
