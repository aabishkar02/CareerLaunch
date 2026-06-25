import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'
import { emailService } from '../services/email.service.js'
import { DateTime } from 'luxon'

const CST = 'America/Chicago'

function weekBoundsForDate(dateStr) {
  // dateStr: YYYY-MM-DD (session's scheduled_date as a date string)
  const dt = DateTime.fromISO(dateStr, { zone: CST })
  const monday = dt.startOf('week') // Luxon ISO week: Monday = start
  const sunday = monday.plus({ days: 6 }).set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
  return {
    key: monday.toISODate(),       // "YYYY-MM-DD" used as map key
    weekStart: monday.toJSDate(),  // Monday 00:00 CST → UTC
    weekEnd: sunday.toJSDate(),    // Sunday 23:59:59 CST → UTC
  }
}

function weekBoundsFromKey(weekStartKey) {
  // weekStartKey: "YYYY-MM-DD" (the Monday date in CST)
  return weekBoundsForDate(weekStartKey)
}

// ── GET /api/v1/admin/payroll/weeks ───────────────────────────
// Returns all CST weeks with at least one completed session, sorted descending.
export const getPayrollWeeks = async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { status: 'completed' },
      orderBy: { scheduled_date: 'desc' },
      include: {
        tutor: {
          select: {
            id: true, first_name: true, last_name: true, email: true,
            tutor_profile: { select: { pay_rate_cents: true, weekly_base_pay_cents: true } },
          },
        },
        student: { select: { id: true, first_name: true, last_name: true, username: true } },
        module:  { select: { id: true, name: true } },
        course:  { select: { id: true, title: true } },
      },
    })

    // Group by week key then by tutor
    const weekMap = {}
    for (const s of sessions) {
      const dateStr = s.scheduled_date instanceof Date
        ? s.scheduled_date.toISOString().slice(0, 10)
        : String(s.scheduled_date).slice(0, 10)
      const { key, weekStart, weekEnd } = weekBoundsForDate(dateStr)

      if (!weekMap[key]) weekMap[key] = { weekStart, weekEnd, key, tutors: {} }
      const tid = s.tutor_id
      if (!weekMap[key].tutors[tid]) {
        weekMap[key].tutors[tid] = {
          tutorId:      tid,
          tutorName:    `${s.tutor.first_name} ${s.tutor.last_name}`,
          tutorEmail:   s.tutor.email,
          payRateCents: s.tutor.tutor_profile?.pay_rate_cents ?? 0,
          basePayCents: s.tutor.tutor_profile?.weekly_base_pay_cents ?? 0,
          sessions:     [],
        }
      }
      weekMap[key].tutors[tid].sessions.push({
        id:              s.id,
        subject:         s.subject,
        studentName:     s.student ? `${s.student.first_name} ${s.student.last_name}` : '',
        studentUsername: s.student?.username || null,
        studentId:       s.student_id,
        startTime:       s.start_time,
        scheduledDate:   dateStr,
        durationMinutes: s.duration_minutes,
        moduleName:      s.module?.name || null,
      })
    }

    // Fetch existing PayrollPayment records for these week_starts
    const weekStarts = Object.values(weekMap).map(w => w.weekStart)
    const payments = weekStarts.length
      ? await prisma.payrollPayment.findMany({ where: { week_start: { in: weekStarts } } })
      : []

    // Build a lookup keyed by "tutorId|weekStart ISO"
    const paymentLookup = {}
    for (const p of payments) {
      const k = `${p.tutor_id}|${p.week_start.toISOString()}`
      paymentLookup[k] = p
    }

    // Build sorted result
    const result = Object.values(weekMap)
      .sort((a, b) => b.key.localeCompare(a.key))
      .map(week => {
        const tutors = Object.values(week.tutors).map(t => {
          const sessionCount    = t.sessions.length
          const lookupKey       = `${t.tutorId}|${week.weekStart.toISOString()}`
          const payment         = paymentLookup[lookupKey]

          // If a payment already exists, use its snapshotted amounts rather than the live rate
          const sessionPayCents = payment ? payment.session_pay_cents : t.payRateCents * sessionCount
          const basePayCents    = payment ? payment.base_pay_cents    : t.basePayCents
          const totalPayCents   = payment ? payment.total_pay_cents   : sessionPayCents + basePayCents
          // Derive snapshotted rate from payment if available
          const payRateCents    = payment && sessionCount > 0
            ? Math.round(payment.session_pay_cents / sessionCount)
            : t.payRateCents

          return {
            tutorId:       t.tutorId,
            tutorName:     t.tutorName,
            tutorEmail:    t.tutorEmail,
            sessions:      t.sessions,
            sessionCount,
            payRateCents,
            sessionPayCents,
            basePayCents,
            totalPayCents,
            paymentStatus: payment ? payment.status : 'UNPAID',
            paymentId:     payment?.id ?? null,
          }
        })
        return { weekStart: week.weekStart, weekEnd: week.weekEnd, tutors }
      })

    return res.json({ success: true, data: { weeks: result } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── POST /api/v1/admin/payroll/pay/weekly ─────────────────────
// Body: { tutorId, weekStart } — weekStart is "YYYY-MM-DD" (Monday in CST)
export const createWeeklyPayment = async (req, res) => {
  try {
    const { tutorId, weekStart: weekStartKey } = req.body
    if (!tutorId || !weekStartKey) {
      return res.status(400).json({ success: false, error: 'tutorId and weekStart are required' })
    }

    const { weekStart, weekEnd } = weekBoundsFromKey(weekStartKey)

    const existing = await prisma.payrollPayment.findUnique({
      where: { tutor_id_week_start: { tutor_id: tutorId, week_start: weekStart } },
    })
    if (existing) {
      return res.status(409).json({ success: false, error: 'Payment already exists for this tutor and week' })
    }

    // Count completed sessions in this week for this tutor
    const sessions = await prisma.session.findMany({
      where: {
        tutor_id: tutorId,
        status:   'completed',
        scheduled_date: { gte: weekStart, lte: weekEnd },
      },
      select: { id: true, duration_minutes: true },
    })

    const tutorProfile = await prisma.tutorProfile.findUnique({
      where:  { tutor_id: tutorId },
      select: { pay_rate_cents: true, weekly_base_pay_cents: true },
    })

    const payRateCents    = tutorProfile?.pay_rate_cents ?? 0
    const basePayCents    = tutorProfile?.weekly_base_pay_cents ?? 0
    const sessionCount    = sessions.length
    const sessionPayCents = payRateCents * sessionCount
    const totalPayCents   = sessionPayCents + basePayCents

    const payment = await prisma.payrollPayment.create({
      data: {
        tutor_id:           tutorId,
        week_start:         weekStart,
        week_end:           weekEnd,
        sessions_completed: sessionCount,
        session_pay_cents:  sessionPayCents,
        base_pay_cents:     basePayCents,
        total_pay_cents:    totalPayCents,
        status:             'PENDING',
      },
      include: { tutor: { select: { id: true, first_name: true, last_name: true, email: true } } },
    })

    return res.status(201).json({ success: true, data: { payment } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── POST /api/v1/admin/payroll/pay/week-all ───────────────────
// Body: { weekStart } — weekStart is "YYYY-MM-DD" (Monday in CST)
export const createWeekAllPayment = async (req, res) => {
  try {
    const { weekStart: weekStartKey } = req.body
    if (!weekStartKey) {
      return res.status(400).json({ success: false, error: 'weekStart is required' })
    }

    const { weekStart, weekEnd } = weekBoundsFromKey(weekStartKey)

    // Find all tutors with completed sessions in this week
    const sessions = await prisma.session.findMany({
      where: {
        status: 'completed',
        scheduled_date: { gte: weekStart, lte: weekEnd },
      },
      select: { tutor_id: true },
      distinct: ['tutor_id'],
    })
    const tutorIds = sessions.map(s => s.tutor_id)

    // Check which tutors already have a payment
    const existing = await prisma.payrollPayment.findMany({
      where: { week_start: weekStart, tutor_id: { in: tutorIds } },
      select: { tutor_id: true },
    })
    const paidTutorIds = new Set(existing.map(p => p.tutor_id))
    const unpaidTutorIds = tutorIds.filter(id => !paidTutorIds.has(id))

    if (unpaidTutorIds.length === 0) {
      return res.json({ success: true, data: { created: 0, message: 'All tutors already have payments for this week' } })
    }

    // Fetch session counts and profiles for unpaid tutors
    const [sessionCounts, profiles] = await Promise.all([
      prisma.session.groupBy({
        by: ['tutor_id'],
        where: { tutor_id: { in: unpaidTutorIds }, status: 'completed', scheduled_date: { gte: weekStart, lte: weekEnd } },
        _count: { id: true },
      }),
      prisma.tutorProfile.findMany({
        where: { tutor_id: { in: unpaidTutorIds } },
        select: { tutor_id: true, pay_rate_cents: true, weekly_base_pay_cents: true },
      }),
    ])

    const countMap   = Object.fromEntries(sessionCounts.map(r => [r.tutor_id, r._count.id]))
    const profileMap = Object.fromEntries(profiles.map(p => [p.tutor_id, p]))

    const payments = await prisma.payrollPayment.createMany({
      data: unpaidTutorIds.map(tid => {
        const profile    = profileMap[tid]
        const count      = countMap[tid] ?? 0
        const rate       = profile?.pay_rate_cents ?? 0
        const base       = profile?.weekly_base_pay_cents ?? 0
        const sessionPay = rate * count
        const total      = sessionPay + base
        return {
          tutor_id:           tid,
          week_start:         weekStart,
          week_end:           weekEnd,
          sessions_completed: count,
          session_pay_cents:  sessionPay,
          base_pay_cents:     base,
          total_pay_cents:    total,
          status:             'PENDING',
        }
      }),
      skipDuplicates: true,
    })

    return res.status(201).json({ success: true, data: { created: payments.count } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── GET /api/v1/admin/payroll/activity ───────────────────────
export const getPayrollActivity = async (req, res) => {
  try {
    const payments = await prisma.payrollPayment.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        tutor: {
          select: {
            id: true, first_name: true, last_name: true, email: true,
            banking_details: true,
          },
        },
      },
    })
    return res.json({ success: true, data: { payments } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── PATCH /api/v1/admin/payroll/activity/:paymentId/done ─────
// Body: { confirmedByEmail, referenceNumber?, notes? }
export const markPaymentDone = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { paymentId } = req.params
    const { confirmedByEmail, referenceNumber, notes } = req.body

    if (!confirmedByEmail?.trim()) {
      return res.status(400).json({ success: false, error: 'confirmedByEmail is required' })
    }

    const existing = await prisma.payrollPayment.findUnique({
      where: { id: paymentId },
      include: { tutor: { select: { id: true, first_name: true, last_name: true, email: true } } },
    })
    if (!existing) return res.status(404).json({ success: false, error: 'Payment not found' })
    if (existing.status === 'PAID') return res.status(409).json({ success: false, error: 'Payment already marked as done' })

    const payment = await prisma.payrollPayment.update({
      where: { id: paymentId },
      data:  {
        status:            'PAID',
        approved_by_email: confirmedByEmail.trim(),
        approved_at:       new Date(),
        reference_number:  referenceNumber?.trim() || null,
        payment_notes:     notes?.trim() || null,
        notification_sent: true,
      },
      include: {
        tutor: {
          select: {
            id: true, first_name: true, last_name: true, email: true,
            banking_details: true,
          },
        },
      },
    })

    const weekStartFmt = new Date(payment.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const weekEndFmt   = new Date(payment.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const weekRange    = `${weekStartFmt} – ${weekEndFmt}`

    // Email tutor
    await emailService.sendPaymentProcessed(payment.tutor.email, {
      firstName:    payment.tutor.first_name,
      weekRange,
      sessions:     payment.sessions_completed,
      payRateFmt:   `$${(payment.session_pay_cents / Math.max(payment.sessions_completed, 1) / 100).toFixed(2)}`,
      sessionPay:   `$${(payment.session_pay_cents / 100).toFixed(2)}`,
      basePay:      `$${(payment.base_pay_cents / 100).toFixed(2)}`,
      totalPay:     `$${(payment.total_pay_cents / 100).toFixed(2)}`,
      confirmedBy:  confirmedByEmail.trim(),
    })

    // In-app notification
    const refNote = payment.reference_number ? ` · Ref: ${payment.reference_number}` : ''
    await prisma.notification.create({
      data: {
        user_id: payment.tutor_id,
        title:   'Payment processed',
        message: `Your payment of $${(payment.total_pay_cents / 100).toFixed(2)} for the week of ${weekRange} has been confirmed by ${confirmedByEmail.trim()}${refNote}.`,
        type:    'info',
        sent_by: adminId,
      },
    })

    // Admin logbook
    await prisma.auditLog.create({
      data: {
        actor_id:       adminId,
        target_user_id: payment.tutor_id,
        action:         'payroll.weekly.confirmed',
        entity_type:    'payroll_payment',
        entity_id:      payment.id,
        new_value:      {
          tutor_id:         payment.tutor_id,
          payment_id:       payment.id,
          total_pay_cents:  payment.total_pay_cents,
          confirmed_by:     confirmedByEmail.trim(),
          reference_number: payment.reference_number,
          week_range:       weekRange,
        },
      },
    })

    return res.json({ success: true, data: { payment } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── GET /api/v1/admin/tutors/:id/payroll/weeks ───────────────
export const getTutorPayrollWeeks = async (req, res) => {
  try {
    const tutorId = req.params.id
    const sessions = await prisma.session.findMany({
      where: { tutor_id: tutorId, status: 'completed' },
      orderBy: { scheduled_date: 'desc' },
      include: { student: { select: { id: true, first_name: true, last_name: true } } },
    })
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where:  { tutor_id: tutorId },
      select: { pay_rate_cents: true, weekly_base_pay_cents: true },
    })
    const weekMap = {}
    for (const s of sessions) {
      const dateStr = s.scheduled_date instanceof Date
        ? s.scheduled_date.toISOString().slice(0, 10)
        : String(s.scheduled_date).slice(0, 10)
      const { key, weekStart, weekEnd } = weekBoundsForDate(dateStr)
      if (!weekMap[key]) weekMap[key] = { weekStart, weekEnd, key, sessions: [] }
      weekMap[key].sessions.push({
        id:              s.id,
        subject:         s.subject,
        studentName:     s.student ? `${s.student.first_name} ${s.student.last_name}` : '',
        studentUsername: s.student?.username || null,
        scheduledDate:   dateStr,
        startTime:       s.start_time,
        durationMinutes: s.duration_minutes,
      })
    }
    const weekStarts = Object.values(weekMap).map(w => w.weekStart)
    const payments = weekStarts.length
      ? await prisma.payrollPayment.findMany({ where: { tutor_id: tutorId, week_start: { in: weekStarts } } })
      : []
    const paymentByWeek = Object.fromEntries(payments.map(p => [p.week_start.toISOString(), p]))
    const payRate = tutorProfile?.pay_rate_cents ?? 0
    const basePay = tutorProfile?.weekly_base_pay_cents ?? 0
    const result = Object.values(weekMap)
      .sort((a, b) => b.key.localeCompare(a.key))
      .map(week => {
        const count   = week.sessions.length
        const payment = paymentByWeek[week.weekStart.toISOString()]
        const sessionPayCents = payment ? payment.session_pay_cents : payRate * count
        const basePayCents    = payment ? payment.base_pay_cents    : basePay
        const totalPayCents   = payment ? payment.total_pay_cents   : sessionPayCents + basePayCents
        const payRateCents    = payment && count > 0 ? Math.round(payment.session_pay_cents / count) : payRate
        return {
          weekStart: week.weekStart, weekEnd: week.weekEnd, sessions: week.sessions,
          sessionCount: count, payRateCents, sessionPayCents, basePayCents, totalPayCents,
          payment: payment ? {
            id:                payment.id,
            status:            payment.status,
            totalPayCents:     payment.total_pay_cents,
            sessionPayCents:   payment.session_pay_cents,
            basePayCents:      payment.base_pay_cents,
            sessionsCompleted: payment.sessions_completed,
            approvedAt:        payment.approved_at,
            approvedByEmail:   payment.approved_by_email,
            referenceNumber:   payment.reference_number,
            notes:             payment.payment_notes,
          } : null,
        }
      })
    return res.json({ success: true, data: { weeks: result } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── GET /api/v1/tutors/me/payroll/my-weeks ───────────────────
export const getMyPayrollWeeks = async (req, res) => {
  try {
    const tutorId = req.user.userId

    const sessions = await prisma.session.findMany({
      where: { tutor_id: tutorId, status: 'completed' },
      orderBy: { scheduled_date: 'desc' },
      include: { student: { select: { id: true, first_name: true, last_name: true } } },
    })

    const tutorProfile = await prisma.tutorProfile.findUnique({
      where:  { tutor_id: tutorId },
      select: { pay_rate_cents: true, weekly_base_pay_cents: true },
    })

    const weekMap = {}
    for (const s of sessions) {
      const dateStr = s.scheduled_date instanceof Date
        ? s.scheduled_date.toISOString().slice(0, 10)
        : String(s.scheduled_date).slice(0, 10)
      const { key, weekStart, weekEnd } = weekBoundsForDate(dateStr)

      if (!weekMap[key]) weekMap[key] = { weekStart, weekEnd, key, sessions: [] }
      weekMap[key].sessions.push({
        id:              s.id,
        subject:         s.subject,
        studentName:     s.student ? `${s.student.first_name} ${s.student.last_name}` : '',
        studentUsername: s.student?.username || null,
        scheduledDate:   dateStr,
        startTime:       s.start_time,
        durationMinutes: s.duration_minutes,
      })
    }

    // Fetch payment records for this tutor
    const weekStarts = Object.values(weekMap).map(w => w.weekStart)
    const payments   = weekStarts.length
      ? await prisma.payrollPayment.findMany({
          where: { tutor_id: tutorId, week_start: { in: weekStarts } },
        })
      : []
    const paymentByWeek = Object.fromEntries(payments.map(p => [p.week_start.toISOString(), p]))

    const payRate = tutorProfile?.pay_rate_cents ?? 0
    const basePay = tutorProfile?.weekly_base_pay_cents ?? 0

    const result = Object.values(weekMap)
      .sort((a, b) => b.key.localeCompare(a.key))
      .map(week => {
        const count      = week.sessions.length
        const payment    = paymentByWeek[week.weekStart.toISOString()]

        // Use snapshotted amounts when a payment exists so rate changes don't affect history
        const sessionPayCents = payment ? payment.session_pay_cents  : payRate * count
        const basePayCents    = payment ? payment.base_pay_cents     : basePay
        const totalPayCents   = payment ? payment.total_pay_cents    : sessionPayCents + basePayCents
        const payRateCents    = payment && count > 0
          ? Math.round(payment.session_pay_cents / count)
          : payRate

        return {
          weekStart:       week.weekStart,
          weekEnd:         week.weekEnd,
          sessions:        week.sessions,
          sessionCount:    count,
          payRateCents,
          sessionPayCents,
          basePayCents,
          totalPayCents,
          payment: payment ? {
            id:                payment.id,
            status:            payment.status,
            totalPayCents:     payment.total_pay_cents,
            sessionPayCents:   payment.session_pay_cents,
            basePayCents:      payment.base_pay_cents,
            sessionsCompleted: payment.sessions_completed,
            payRateCents:      Math.round(payment.sessions_completed > 0 ? payment.session_pay_cents / payment.sessions_completed : 0),
            approvedAt:        payment.approved_at,
            referenceNumber:   payment.reference_number,
          } : null,
        }
      })

    return res.json({ success: true, data: { weeks: result } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}
