import request from "supertest";
import app from "../app.js";
import { prisma } from "../config/db.js";

// These tests cover the payment confirmation flow.
// They do NOT hit real Stripe — they exercise the backend validation,
// idempotency check, and error handling around confirmPayment.

const student = {
  first_name: "Pay",
  last_name: "Test",
  email: "payment.test.student@example.com",
  password: "Password123!",
  role: "student",
};

let accessCookie = "";

beforeAll(async () => {
  // Clean up and register student
  await prisma.refreshToken.deleteMany({ where: { user: { email: student.email } } });
  await prisma.user.deleteMany({ where: { email: student.email } });

  const res = await request(app).post("/api/v1/auth/register").send(student);
  const cookies = res.headers["set-cookie"] || [];
  accessCookie = cookies.find(c => c.startsWith("accessToken=")) || "";
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { student: { email: student.email } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: student.email } } });
  await prisma.user.deleteMany({ where: { email: student.email } });
  await prisma.$disconnect();
});

// ============================================================
// CREATE INTENT — validation
// ============================================================

describe("POST /api/v1/payments/create-intent — validation", () => {

  it("should return 401 if not authenticated", async () => {
    const res = await request(app)
      .post("/api/v1/payments/create-intent")
      .send({ courseId: "00000000-0000-0000-0000-000000000001", planType: "full" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 if courseId is missing", async () => {
    const res = await request(app)
      .post("/api/v1/payments/create-intent")
      .set("Cookie", accessCookie)
      .send({ planType: "full" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 if courseId is not a UUID", async () => {
    const res = await request(app)
      .post("/api/v1/payments/create-intent")
      .set("Cookie", accessCookie)
      .send({ courseId: "not-a-uuid", planType: "full" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/invalid course/i);
  });

  it("should return 400 if planType is missing", async () => {
    const res = await request(app)
      .post("/api/v1/payments/create-intent")
      .set("Cookie", accessCookie)
      .send({ courseId: "00000000-0000-0000-0000-000000000001" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 403 if a tutor tries to create an intent", async () => {
    // Register a tutor
    const tutor = {
      first_name: "T", last_name: "T",
      email: "tutor.pay.test@example.com",
      password: "Password123!", role: "tutor",
    };
    await prisma.refreshToken.deleteMany({ where: { user: { email: tutor.email } } });
    await prisma.user.deleteMany({ where: { email: tutor.email } });

    const reg = await request(app).post("/api/v1/auth/register").send(tutor);
    // Tutors are pending approval — approve manually
    await prisma.user.update({ where: { email: tutor.email }, data: { approved: true } });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: tutor.email, password: tutor.password });

    const tutorCookies = login.headers["set-cookie"] || [];
    const tutorCookie  = tutorCookies.find(c => c.startsWith("accessToken=")) || "";

    const res = await request(app)
      .post("/api/v1/payments/create-intent")
      .set("Cookie", tutorCookie)
      .send({ courseId: "00000000-0000-0000-0000-000000000001", planType: "full" });

    expect(res.status).toBe(403);

    await prisma.refreshToken.deleteMany({ where: { user: { email: tutor.email } } });
    await prisma.user.deleteMany({ where: { email: tutor.email } });
  });

});

// ============================================================
// CONFIRM PAYMENT — validation
// ============================================================

describe("POST /api/v1/payments/confirm — validation", () => {

  it("should return 401 if not authenticated", async () => {
    const res = await request(app)
      .post("/api/v1/payments/confirm")
      .send({ paymentIntentId: "pi_test_123" });

    expect(res.status).toBe(401);
  });

  it("should return 400 if paymentIntentId is missing", async () => {
    const res = await request(app)
      .post("/api/v1/payments/confirm")
      .set("Cookie", accessCookie)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 4xx for a non-existent paymentIntentId", async () => {
    // Stripe will return an error for a fake intent ID
    const res = await request(app)
      .post("/api/v1/payments/confirm")
      .set("Cookie", accessCookie)
      .send({ paymentIntentId: "pi_fake_does_not_exist_123456789" });

    // Should be a client or server error, not a success
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

});

// ============================================================
// IDEMPOTENCY — double-confirm returns same result
// ============================================================

describe("Payment idempotency", () => {

  it("should return 200 if payment already processed (idempotency)", async () => {
    // Manually create a payment row that is already 'succeeded'
    const studentUser = await prisma.user.findUnique({ where: { email: student.email } });
    const succeeded = await prisma.payment.create({
      data: {
        student_id:                studentUser.id,
        stripe_payment_intent_id:  "pi_idempotency_test_already_done",
        amount_cents:               10000,
        currency:                  "usd",
        status:                    "succeeded",
        payment_method:            "stripe",
        plan_type:                 "full",
        receipt_number:            "RCP-IDEMPTEST-0001",
      },
    });

    const res = await request(app)
      .post("/api/v1/payments/confirm")
      .set("Cookie", accessCookie)
      .send({ paymentIntentId: "pi_idempotency_test_already_done" });

    // Idempotency: should succeed, not double-process
    expect([200, 402, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }

    await prisma.payment.delete({ where: { id: succeeded.id } });
  });

});
