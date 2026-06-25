import "dotenv/config";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../config/db.js";

// Verifies the session-credit "hold" model:
//   - Booking is allowed only while the student has an un-held credit.
//   - Each pending/confirmed session holds one credit (no double-spending).
//   - Booking beyond the balance returns 402 (not a silent over-book).
//   - Cancelling a session releases its held credit so a new booking fits.
// The actual decrement of credits_used happens at completion (covered by the
// completeSession controller); here we prove the hold/release accounting.

const TAG = "creditflow";
const GRANTED = 3;
const FUTURE_DATE = "2027-01-15"; // far future so student self-cancel (>24h) is allowed
let studentId, tutorId, moduleId, studentCookie;

const book = (start, end) =>
  request(app)
    .post("/api/v1/sessions/request")
    .set("Cookie", studentCookie)
    .send({
      tutor_id: tutorId,
      module_id: moduleId,
      subject: "Mock interview",
      scheduled_date: FUTURE_DATE,
      start_time: start,
      end_time: end,
    });

beforeAll(async () => {
  const student = await prisma.user.create({
    data: { first_name: "Credit", last_name: "Flow", email: `${TAG}.student@example.com`, password_hash: "x", role: "student" },
  });
  studentId = student.id;

  const tutor = await prisma.user.create({
    data: { first_name: "Tut", last_name: "Or", email: `${TAG}.tutor@example.com`, password_hash: "x", role: "tutor", approved: true, timezone: "UTC" },
  });
  tutorId = tutor.id;

  const mod = await prisma.module.create({
    data: { name: "Credit Flow Module", slug: `${TAG}-module`, status: "published", visibility: "public" },
  });
  moduleId = mod.id;

  await prisma.moduleEnrollment.create({ data: { student_id: studentId, module_id: moduleId, tutor_id: tutorId, status: "active" } });
  await prisma.moduleTutor.create({ data: { module_id: moduleId, tutor_id: tutorId } });
  await prisma.moduleCredit.create({ data: { student_id: studentId, module_id: moduleId, credits_granted: GRANTED, credits_used: 0 } });

  studentCookie = `accessToken=${jwt.sign({ userId: studentId, role: "student", email: student.email }, process.env.JWT_SECRET, { expiresIn: "15m" })}`;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { student_id: studentId } });
  await prisma.notification.deleteMany({ where: { user_id: { in: [studentId, tutorId] } } });
  await prisma.moduleCredit.deleteMany({ where: { student_id: studentId } });
  await prisma.moduleTutor.deleteMany({ where: { module_id: moduleId } });
  await prisma.moduleEnrollment.deleteMany({ where: { student_id: studentId } });
  await prisma.module.deleteMany({ where: { id: moduleId } });
  await prisma.user.deleteMany({ where: { id: { in: [studentId, tutorId] } } });
  await prisma.$disconnect();
});

describe("Session credit hold/release", () => {
  const sessionIds = [];

  it(`allows booking up to the credit balance (${GRANTED})`, async () => {
    const slots = [["09:00", "09:30"], ["10:00", "10:30"], ["11:00", "11:30"]];
    for (const [s, e] of slots) {
      const res = await book(s, e);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      sessionIds.push(res.body.data.session.id);
    }
    expect(sessionIds.length).toBe(GRANTED);
  });

  it("blocks the booking that would exceed the balance (402, not over-booked)", async () => {
    const res = await book("12:00", "12:30");
    expect(res.status).toBe(402);
    expect(res.body.success).toBe(false);
    expect(res.body.noCredits).toBe(true);

    // And the DB did not silently create a 4th active session.
    const count = await prisma.session.count({
      where: { student_id: studentId, module_id: moduleId, status: { in: ["pending", "confirmed"] } },
    });
    expect(count).toBe(GRANTED);
  });

  it("releases the held credit when a session is cancelled, allowing a new booking", async () => {
    // Cancel one of the held sessions (student self-cancel, >24h out).
    const cancel = await request(app)
      .patch(`/api/v1/sessions/${sessionIds[0]}/cancel`)
      .set("Cookie", studentCookie)
      .send({ reason: "schedule change" });
    expect(cancel.status).toBe(200);

    // Now there is room for exactly one more booking.
    const ok = await book("12:00", "12:30");
    expect(ok.status).toBe(201);

    // But not two — the balance is full again.
    const blocked = await book("13:00", "13:30");
    expect(blocked.status).toBe(402);
  });
});
