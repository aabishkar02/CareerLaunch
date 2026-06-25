import "dotenv/config";
import { prisma } from "../config/db.js";
import { fulfillPaymentIntent } from "../controllers/payment.controller.js";

// Exercises the shared fulfillment path that the Stripe webhook now uses as the
// source of truth. fulfillPaymentIntent() only calls Stripe to fetch a receipt
// URL when pi.latest_charge is set — passing null keeps this fully offline.
//
// What we verify:
//   1. A succeeded intent grants the right enrollment + credits.
//   2. Calling it again is idempotent (no double credits) — i.e. the webhook
//      and the client /confirm can both fire without over-granting.
//   3. A non-succeeded intent is a no-op.

const TAG = "fulfilltest";
let studentId, moduleId, planId, paymentId;
const intentId = `pi_${TAG}_${Date.now()}`;
const CREDITS_PER_MODULE = 3;

beforeAll(async () => {
  const student = await prisma.user.create({
    data: {
      first_name: "Fulfill", last_name: "Test",
      email: `${TAG}.student@example.com`,
      password_hash: "x", role: "student",
    },
  });
  studentId = student.id;

  const mod = await prisma.module.create({
    data: { name: "Fulfillment Test Module", slug: `${TAG}-module`, status: "published", visibility: "public" },
  });
  moduleId = mod.id;

  // Single-module managed plan (no plan_modules) — student picks the module at checkout.
  const plan = await prisma.plan.create({
    data: { name: "Fulfillment Test Plan", credits_per_module: CREDITS_PER_MODULE, price_cents: 4900, status: "active" },
  });
  planId = plan.id;

  const payment = await prisma.payment.create({
    data: {
      student_id: studentId,
      managed_plan_id: planId,
      stripe_payment_intent_id: intentId,
      amount_cents: 4900,
      currency: "usd",
      status: "pending",
      payment_method: "stripe",
    },
  });
  paymentId = payment.id;
});

afterAll(async () => {
  await prisma.moduleEnrollment.deleteMany({ where: { student_id: studentId } });
  await prisma.moduleCredit.deleteMany({ where: { student_id: studentId } });
  await prisma.notification.deleteMany({ where: { user_id: studentId } });
  await prisma.payment.deleteMany({ where: { id: paymentId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.module.deleteMany({ where: { id: moduleId } });
  await prisma.user.deleteMany({ where: { id: studentId } });
  await prisma.$disconnect();
});

const fakePi = (status = "succeeded") => ({
  id: intentId,
  status,
  latest_charge: null,
  metadata: { student_id: studentId, selected_module_id: moduleId },
});

describe("fulfillPaymentIntent (webhook source of truth)", () => {

  it("should be a no-op for a non-succeeded intent", async () => {
    const result = await fulfillPaymentIntent(fakePi("processing"));
    expect(result.fulfilled).toBe(false);

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment.status).toBe("pending");
  });

  it("should grant enrollment + credits for a succeeded intent", async () => {
    const result = await fulfillPaymentIntent(fakePi());

    expect(result.fulfilled).toBe(true);
    expect(result.alreadyProcessed).toBeFalsy();
    expect(result.modules_unlocked).toBe(1);
    expect(result.credits_added).toBe(CREDITS_PER_MODULE);

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment.status).toBe("succeeded");
    expect(payment.receipt_number).toBeTruthy();

    const enrollment = await prisma.moduleEnrollment.findUnique({
      where: { student_id_module_id: { student_id: studentId, module_id: moduleId } },
    });
    expect(enrollment).not.toBeNull();
    expect(enrollment.status).toBe("active");

    const credit = await prisma.moduleCredit.findUnique({
      where: { student_id_module_id: { student_id: studentId, module_id: moduleId } },
    });
    expect(credit.credits_granted).toBe(CREDITS_PER_MODULE);
  });

  it("should be idempotent — a second call does NOT double-grant credits", async () => {
    const result = await fulfillPaymentIntent(fakePi());
    expect(result.fulfilled).toBe(true);
    expect(result.alreadyProcessed).toBe(true);

    const credit = await prisma.moduleCredit.findUnique({
      where: { student_id_module_id: { student_id: studentId, module_id: moduleId } },
    });
    // Still 3, not 6 — credits were not granted twice.
    expect(credit.credits_granted).toBe(CREDITS_PER_MODULE);
  });

});
