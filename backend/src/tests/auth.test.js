import request from "supertest";
import app from "../app.js";
import { prisma } from "../config/db.js";

// ─── Test user data ──────────────────────────────────────────

const testUser = {
  first_name: "John",
  last_name: "Doe",
  email: "john.doe.test@example.com",
  password: "Password123!",
  role: "student",
};

let accessTokenCookie  = "";  // httpOnly cookie captured from response
let refreshTokenCookie = "";  // httpOnly refresh cookie
let testUserId         = "";

// Helper: join all set-cookie headers for subsequent requests
function getCookies(res) {
  return (res.headers["set-cookie"] || []).join("; ")
}

// ─── Cleanup ─────────────────────────────────────────────────

beforeAll(async () => {
  await prisma.refreshToken.deleteMany({ where: { user: { email: testUser.email } } });
  await prisma.user.deleteMany({ where: { email: testUser.email } });
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({ where: { user: { email: testUser.email } } });
  await prisma.user.deleteMany({ where: { email: testUser.email } });
  await prisma.$disconnect();
});

// ============================================================
// REGISTER
// ============================================================

describe("POST /api/v1/auth/register", () => {

  it("should register a new user and set httpOnly cookies", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.role).toBe("student");

    // Tokens must be in cookies, NOT in body
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.body.data.accessToken).toBeUndefined();

    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some(c => c.startsWith("accessToken="))).toBe(true);
    expect(cookies.some(c => c.startsWith("refreshToken="))).toBe(true);

    accessTokenCookie  = cookies.find(c => c.startsWith("accessToken=")) || "";
    refreshTokenCookie = cookies.find(c => c.startsWith("refreshToken=")) || "";
    testUserId         = res.body.data.user.id;
  });

  it("should return 400 if required fields are missing", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "missing@fields.com", password: "Password123!" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/required/i);
  });

  it("should return 400 if role is invalid", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...testUser, email: "other@test.com", role: "superadmin" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/role/i);
  });

  it("should return 409 if email already exists", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("should never return password_hash in response", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...testUser, email: "nohash@test.com" });

    expect(res.body.data?.user?.password_hash).toBeUndefined();

    await prisma.refreshToken.deleteMany({ where: { user: { email: "nohash@test.com" } } });
    await prisma.user.deleteMany({ where: { email: "nohash@test.com" } });
  });

});

// ============================================================
// LOGIN
// ============================================================

describe("POST /api/v1/auth/login", () => {

  it("should login and set httpOnly accessToken + refreshToken cookies", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email);

    // Tokens must be in cookies, NOT in body
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.body.data.accessToken).toBeUndefined();

    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some(c => c.startsWith("accessToken="))).toBe(true);
    expect(cookies.some(c => c.startsWith("refreshToken="))).toBe(true);

    accessTokenCookie  = cookies.find(c => c.startsWith("accessToken=")) || "";
    refreshTokenCookie = cookies.find(c => c.startsWith("refreshToken=")) || "";
  });

  it("should return 400 if email or password missing", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 401 if email does not exist", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@nowhere.com", password: "Password123!" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it("should return 401 if password is wrong", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email, password: "WrongPassword!" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it("should never return password_hash in response", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    expect(res.body.data?.user?.password_hash).toBeUndefined();
  });

});

// ============================================================
// GET ME
// ============================================================

describe("GET /api/v1/auth/me", () => {

  it("should return current user from cookie", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", accessTokenCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email);
  });

  it("should return 401 if no cookie", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should return 401 if cookie is tampered", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", "accessToken=faketoken.tampered.value");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

});

// ============================================================
// REFRESH TOKEN
// ============================================================

describe("POST /api/v1/auth/refresh", () => {

  it("should exchange refreshToken cookie for new httpOnly cookies", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${accessTokenCookie}; ${refreshTokenCookie}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // New cookies set — refresh token NOT in body
    expect(res.body.data?.refreshToken).toBeUndefined();

    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some(c => c.startsWith("accessToken="))).toBe(true);
    expect(cookies.some(c => c.startsWith("refreshToken="))).toBe(true);

    // New refresh token must differ from old
    const newRefreshCookie = cookies.find(c => c.startsWith("refreshToken=")) || "";
    expect(newRefreshCookie).not.toBe(refreshTokenCookie);

    accessTokenCookie  = cookies.find(c => c.startsWith("accessToken="))  || "";
    refreshTokenCookie = newRefreshCookie;
  });

  it("should return 401 if no refreshToken cookie", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should detect token reuse and terminate all sessions", async () => {
    const oldRefreshCookie = refreshTokenCookie;

    // First use: rotate the token
    const firstUse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${accessTokenCookie}; ${oldRefreshCookie}`);

    expect(firstUse.status).toBe(200);
    const newCookies = firstUse.headers["set-cookie"] || [];
    accessTokenCookie  = newCookies.find(c => c.startsWith("accessToken="))  || "";
    refreshTokenCookie = newCookies.find(c => c.startsWith("refreshToken=")) || "";

    // Second use with the OLD (revoked) token — reuse detected
    const reuse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${accessTokenCookie}; ${oldRefreshCookie}`);

    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toMatch(/reuse/i);

    // Re-login to restore fresh tokens
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    const loginCookies = login.headers["set-cookie"] || [];
    accessTokenCookie  = loginCookies.find(c => c.startsWith("accessToken="))  || "";
    refreshTokenCookie = loginCookies.find(c => c.startsWith("refreshToken=")) || "";
  });

});

// ============================================================
// CHANGE PASSWORD
// ============================================================

describe("PATCH /api/v1/auth/change-password", () => {

  it("should change password when authenticated", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/change-password")
      .set("Cookie", accessTokenCookie)
      .send({ currentPassword: testUser.password, newPassword: "NewPassword456!" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email, password: "NewPassword456!" });

    const loginCookies = login.headers["set-cookie"] || [];
    accessTokenCookie  = loginCookies.find(c => c.startsWith("accessToken="))  || "";
    refreshTokenCookie = loginCookies.find(c => c.startsWith("refreshToken=")) || "";
    testUser.password  = "NewPassword456!";
  });

  it("should return 401 if no cookie", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/change-password")
      .send({ currentPassword: testUser.password, newPassword: "Another123!" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 if new password is under 8 chars", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/change-password")
      .set("Cookie", accessTokenCookie)
      .send({ currentPassword: testUser.password, newPassword: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

});

// ============================================================
// FORGOT PASSWORD
// ============================================================

describe("POST /api/v1/auth/forgot-password", () => {

  it("should always return 200 regardless of whether email exists", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: testUser.email });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/if an account/i);
  });

  it("should return 200 for non-existent email (no information leak)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "doesnotexist@nowhere.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/if an account/i);
  });

  it("should return 400 if email is missing", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

});

// ============================================================
// LOGOUT
// ============================================================

describe("POST /api/v1/auth/logout", () => {

  it("should logout and clear both cookies", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", `${accessTokenCookie}; ${refreshTokenCookie}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some(c => /accessToken=;/.test(c))).toBe(true);
    expect(cookies.some(c => /refreshToken=;/.test(c))).toBe(true);
  });

  it("should return 401 if no access token cookie", async () => {
    const res = await request(app).post("/api/v1/auth/logout");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should block access after logout — refresh should fail", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    const loginCookies     = login.headers["set-cookie"] || [];
    const freshAccess      = loginCookies.find(c => c.startsWith("accessToken="))  || "";
    const freshRefresh     = loginCookies.find(c => c.startsWith("refreshToken=")) || "";

    // Logout
    await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", `${freshAccess}; ${freshRefresh}`);

    // Attempt refresh with the now-revoked cookie
    const refreshAttempt = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${freshAccess}; ${freshRefresh}`);

    expect(refreshAttempt.status).toBe(401);
    expect(refreshAttempt.body.success).toBe(false);
  });

});
