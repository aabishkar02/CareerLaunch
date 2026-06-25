import { prisma } from '../config/db.js'
import { getTutorCalendar } from './tutor.controller.js'
import { buildModuleEnrollments } from './payment.controller.js'
import { emailService } from '../services/email.service.js'
import { safeError } from '../utils/prodError.js'

// ─── Stats ───────────────────────────────────────────────────
// GET /api/v1/admin/stats
export const getStats = async (req, res) => {
  try {
    const [students, tutors, enrollments, revenue, sessions, openTickets, unpaidSessions, recentEnrollments, recentPayments] = await Promise.all([
      prisma.user.count({ where: { role: 'student' } }),
      prisma.user.count({ where: { role: 'tutor' } }),
      prisma.enrollment.count(),
      prisma.payment.aggregate({ where: { status: 'succeeded' }, _sum: { amount_cents: true } }),
      prisma.session.count(),
      prisma.supportTicket.count({ where: { status: 'open' } }),
      prisma.session.count({ where: { status: 'completed', tutor_paid: false } }),
      prisma.enrollment.findMany({
        take: 5, orderBy: { enrolled_at: 'desc' },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          course:  { select: { id: true, title: true } },
        },
      }),
      prisma.payment.findMany({
        take: 5, orderBy: { created_at: 'desc' }, where: { status: 'succeeded' },
        include: { student: { select: { id: true, first_name: true, last_name: true } } },
      }),
    ])

    return res.json({
      success: true,
      data: {
        total_students:    students,
        total_tutors:      tutors,
        total_enrollments: enrollments,
        total_revenue:     (revenue._sum.amount_cents || 0) / 100,
        total_sessions:    sessions,
        open_tickets:      openTickets,
        unpaid_sessions:   unpaidSessions,
        recent_enrollments: recentEnrollments.map(e => ({ ...e, status: e.status })),
        recent_payments:    recentPayments.map(p => ({ ...p, amount: p.amount_cents / 100 })),
      },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get all users (filterable by role) ──────────────────────
// GET /api/v1/admin/users?role=student|tutor|admin
export const getUsers = async (req, res) => {
  try {
    const { role } = req.query
    const users = await prisma.user.findMany({
      where:   role ? { role } : {},
      orderBy: { created_at: 'desc' },
      select: {
        id:         true,
        first_name: true,
        last_name:  true,
        email:      true,
        username:   true,
        role:       true,
        onboarded:  true,
        suspended:  true,
        created_at: true,
      },
    })
    return res.json({ success: true, data: { users } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get single user detail ───────────────────────────────────
// GET /api/v1/admin/users/:id
export const getUserDetail = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:   { id: req.params.id },
      include: {
        student_assignments: {
          where:   { status: 'active' },
          include: {
            tutor: {
              select: { id: true, first_name: true, last_name: true, email: true },
            },
          },
        },
        tutor_assignments: {
          where:   { status: 'active' },
          include: {
            student: {
              select: { id: true, first_name: true, last_name: true, email: true },
            },
          },
        },
        enrollments: {
          include: { course: { select: { id: true, title: true } } },
        },
      },
    })

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' })
    }

    const { password_hash, ...safe } = user
    return res.json({ success: true, data: { user: safe } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Suspend / reactivate user ────────────────────────────────
// PATCH /api/v1/admin/users/:id/suspend
export const suspendUser = async (req, res) => {
  try {
    const { suspended, reason } = req.body
    if (typeof suspended !== 'boolean') {
      return res.status(400).json({ success: false, error: 'suspended (boolean) is required' })
    }

    const prev = await prisma.user.findUnique({
      where:  { id: req.params.id },
      select: { first_name: true, last_name: true, email: true, role: true, suspended: true },
    })
    if (!prev) return res.status(404).json({ success: false, error: 'User not found' })
    if (prev.role === 'admin') {
      return res.status(403).json({ success: false, error: 'Admin accounts cannot be suspended' })
    }

    const user = await prisma.user.update({
      where:  { id: req.params.id },
      data:   { suspended, suspended_reason: suspended ? (reason || null) : null },
      select: { id: true, first_name: true, last_name: true, email: true, role: true, suspended: true, suspended_reason: true },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: req.params.id,
        action:         suspended ? 'user.suspended' : 'user.reactivated',
        entity_type:    'user',
        entity_id:      req.params.id,
        ip_address:     req.ip || null,
        old_value:      prev ? { suspended: prev.suspended } : null,
        new_value:      {
          suspended,
          reason:     reason || null,
          user_name:  prev ? `${prev.first_name} ${prev.last_name}` : null,
          user_email: prev?.email || null,
          user_role:  prev?.role  || null,
        },
      },
    })

    return res.json({ success: true, data: { user } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Delete user ──────────────────────────────────────────────
// DELETE /api/v1/admin/users/:id
export const deleteUser = async (req, res) => {
  try {
    const userInfo = await prisma.user.findUnique({
      where:  { id: req.params.id },
      select: { first_name: true, last_name: true, email: true, role: true, created_at: true },
    })

    await prisma.user.delete({ where: { id: req.params.id } })

    await prisma.auditLog.create({
      data: {
        actor_id:    req.user.userId,
        action:      'user.deleted',
        entity_type: 'user',
        entity_id:   req.params.id,
        ip_address:  req.ip || null,
        new_value:   {
          user_name:  userInfo ? `${userInfo.first_name} ${userInfo.last_name}` : null,
          user_email: userInfo?.email     || null,
          user_role:  userInfo?.role      || null,
          joined_at:  userInfo?.created_at || null,
        },
      },
    })

    return res.json({ success: true, message: 'User deleted' })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Assign tutor to student ──────────────────────────────────
// POST /api/v1/admin/assign-tutor
export const assignTutor = async (req, res) => {
  try {
    const { student_id, tutor_id, start_date, notes } = req.body

    if (!student_id || !tutor_id) {
      return res.status(400).json({
        success: false,
        error:   'student_id and tutor_id are required',
      })
    }

    // Verify both users exist with correct roles
    const [student, tutor] = await Promise.all([
      prisma.user.findFirst({ where: { id: student_id, role: 'student' } }),
      prisma.user.findFirst({ where: { id: tutor_id,   role: 'tutor'   } }),
    ])

    if (!student) return res.status(404).json({ success: false, error: 'Student not found' })
    if (!tutor)   return res.status(404).json({ success: false, error: 'Tutor not found' })

    // End any existing active assignment for this student
    await prisma.studentTutorAssignment.updateMany({
      where: { student_id, status: 'active' },
      data:  { status: 'ended', end_date: new Date() },
    })

    // Create new assignment
    const assignment = await prisma.studentTutorAssignment.create({
      data: {
        student_id,
        tutor_id,
        start_date:  start_date ? new Date(start_date) : new Date(),
        status:      'active',
        assigned_by: req.user.userId,
        notes:       notes || null,
      },
      include: {
        student: { select: { id: true, first_name: true, last_name: true, email: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true, email: true } },
      },
    })

    // Notify both parties
    await prisma.notification.createMany({
      data: [
        {
          user_id: student_id,
          title:   'Tutor assigned',
          message: `${assignment.tutor.first_name} ${assignment.tutor.last_name} has been assigned as your tutor.`,
          type:    'info',
          sent_by: req.user.userId,
        },
        {
          user_id: tutor_id,
          title:   'New student assigned',
          message: `${assignment.student.first_name} ${assignment.student.last_name} has been assigned to you.`,
          type:    'info',
          sent_by: req.user.userId,
        },
      ],
    })

    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: student_id,
        action:         'user.tutor_assigned',
        entity_type:    'student_tutor_assignment',
        entity_id:      assignment.id,
        ip_address:     req.ip || null,
        new_value:      {
          student_id,
          tutor_id,
          student_name:  `${assignment.student.first_name} ${assignment.student.last_name}`,
          student_email: assignment.student.email,
          tutor_name:    `${assignment.tutor.first_name} ${assignment.tutor.last_name}`,
          tutor_email:   assignment.tutor.email,
          start_date:    assignment.start_date,
          notes:         notes || null,
        },
      },
    })

    return res.status(201).json({ success: true, data: { assignment } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get all tutor hours ──────────────────────────────────────
// GET /api/v1/admin/tutors/hours
export const getTutorHours = async (req, res) => {
  try {
    const tutors = await prisma.user.findMany({
      where:   { role: 'tutor' },
      select:  { id: true, first_name: true, last_name: true, email: true },
      orderBy: { first_name: 'asc' },
    })

    const withHours = await Promise.all(
      tutors.map(async (t) => {
        const agg = await prisma.attendanceLog.aggregate({
          where: { tutor_id: t.id, clock_out: { not: null } },
          _sum:  { hours_worked: true },
        })
        const recent = await prisma.attendanceLog.findMany({
          where:   { tutor_id: t.id },
          orderBy: { clock_in: 'desc' },
          take:    5,
        })
        return {
          ...t,
          total_hours: Number(agg._sum.hours_worked || 0),
          recent_logs: recent,
        }
      })
    )

    return res.json({ success: true, data: { tutors: withHours } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get detailed stats for a single tutor ───────────────────
// GET /api/v1/admin/tutors/:id/stats
export const getTutorStats = async (req, res) => {
  try {
    const tutorId = req.params.id

    const now    = new Date()
    const weekStart  = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      tutor,
      sessionsByStatus,
      totalHoursAgg,
      weekHoursAgg,
      monthHoursAgg,
      activeStudents,
      moduleAssignments,
      recentSessions,
      upcomingSessions,
    ] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: tutorId },
        select: { id: true, first_name: true, last_name: true, email: true, avatar_url: true, created_at: true },
      }),

      // Session counts by status
      prisma.session.groupBy({
        by:    ['status'],
        where: { tutor_id: tutorId },
        _count: { status: true },
      }),

      // All-time hours from attendance logs (auto-logged from sessions)
      prisma.attendanceLog.aggregate({
        where: { tutor_id: tutorId, clock_out: { not: null } },
        _sum:  { hours_worked: true },
        _count: { id: true },
      }),

      // This week hours
      prisma.attendanceLog.aggregate({
        where: { tutor_id: tutorId, clock_out: { not: null }, clock_in: { gte: weekStart } },
        _sum:  { hours_worked: true },
      }),

      // This month hours
      prisma.attendanceLog.aggregate({
        where: { tutor_id: tutorId, clock_out: { not: null }, clock_in: { gte: monthStart } },
        _sum:  { hours_worked: true },
      }),

      // Active unique students
      prisma.studentTutorAssignment.count({
        where: { tutor_id: tutorId, status: 'active' },
      }),

      // Module assignments
      prisma.moduleTutor.findMany({
        where:   { tutor_id: tutorId },
        include: { module: { select: { id: true, name: true, display_order: true } } },
      }),

      // Last 10 completed sessions
      prisma.session.findMany({
        where:   { tutor_id: tutorId, status: 'completed' },
        orderBy: { completed_at: 'desc' },
        take:    10,
        include: { student: { select: { id: true, first_name: true, last_name: true } } },
      }),

      // Next 5 upcoming sessions
      prisma.session.findMany({
        where: {
          tutor_id:       tutorId,
          status:         { in: ['pending', 'confirmed'] },
          scheduled_date: { gte: new Date() },
        },
        orderBy: { scheduled_date: 'asc' },
        take:    5,
        include: { student: { select: { id: true, first_name: true, last_name: true } } },
      }),
    ])

    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found' })

    const statusMap = {}
    sessionsByStatus.forEach(s => { statusMap[s.status] = s._count.status })

    return res.json({
      success: true,
      data: {
        tutor,
        sessions: {
          completed:  statusMap.completed  || 0,
          confirmed:  statusMap.confirmed  || 0,
          pending:    statusMap.pending    || 0,
          cancelled:  statusMap.cancelled  || 0,
          total:      Object.values(statusMap).reduce((a, b) => a + b, 0),
        },
        hours: {
          all_time:   Math.round(Number(totalHoursAgg._sum.hours_worked || 0) * 100) / 100,
          this_week:  Math.round(Number(weekHoursAgg._sum.hours_worked  || 0) * 100) / 100,
          this_month: Math.round(Number(monthHoursAgg._sum.hours_worked || 0) * 100) / 100,
          log_count:  totalHoursAgg._count.id,
        },
        students: {
          active: activeStudents,
        },
        modules:           moduleAssignments.map(m => m.module),
        recent_sessions:   recentSessions,
        upcoming_sessions: upcomingSessions,
      },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get all enrollments ──────────────────────────────────────
// GET /api/v1/admin/enrollments
export const getEnrollments = async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      orderBy: { enrolled_at: 'desc' },
      include: {
        student: { select: { id: true, first_name: true, last_name: true, email: true } },
        course:  { select: { id: true, title: true } },
      },
    })
    return res.json({ success: true, data: { enrollments } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get all sessions ─────────────────────────────────────────
// GET /api/v1/admin/sessions
export const getSessions = async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { scheduled_date: 'desc' },
      take:    100,
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true } },
      },
    })
    return res.json({ success: true, data: { sessions } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get all payments (with search + filter) ──────────────────
// GET /api/v1/admin/payments?search=&status=&plan=&studentId=&from=&to=&page=&limit=
export const getPayments = async (req, res) => {
  try {
    const { search, status, plan, studentId, from, to, page = 1, limit = 50 } = req.query

    const where = {}
    if (status)    where.status  = status
    if (plan)      where.plan    = { plan_type: plan }
    if (studentId) where.student_id = studentId
    if (from || to) {
      where.created_at = {}
      if (from) where.created_at.gte = new Date(from)
      if (to)   where.created_at.lte = new Date(to + 'T23:59:59.999Z')
    }
    if (search) {
      const trimmed = search.trim().replace(/^#/, '') // strip leading # if pasted from receipt

      const conditions = [
        { stripe_payment_intent_id: { contains: trimmed, mode: 'insensitive' } },
        { student: { email:      { contains: trimmed, mode: 'insensitive' } } },
        { student: { first_name: { contains: trimmed, mode: 'insensitive' } } },
        { student: { last_name:  { contains: trimmed, mode: 'insensitive' } } },
      ]

      // UUID partial/prefix search — handles Ref# format (e.g. "83BD98BF")
      // Prisma UUID type only supports equals; cast to text via raw SQL for prefix match
      if (/^[0-9a-f-]{4,36}$/i.test(trimmed)) {
        try {
          const pattern = trimmed.toLowerCase() + '%'
          const found = await prisma.$queryRaw`
            SELECT id::text AS id FROM payments WHERE id::text ILIKE ${pattern}
          `
          found.forEach(r => conditions.push({ id: { equals: r.id } }))
        } catch (e) {
          console.error('UUID prefix search error:', e.message)
        }
      }

      where.OR = conditions
    }

    const [payments, total, revenueAgg, refundedAgg] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
        include: {
          student:      { select: { id: true, email: true, first_name: true, last_name: true } },
          plan:         { select: { plan_type: true } },
          managed_plan: { select: { id: true, name: true } },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ where: { ...where, status: 'succeeded' }, _sum: { amount_cents: true } }),
      prisma.payment.aggregate({ where: { ...where, status: 'refunded'  }, _sum: { amount_cents: true } }),
    ])

    return res.json({
      success: true,
      data: {
        payments,
        total,
        page:             parseInt(page),
        net_revenue_cents: (revenueAgg._sum.amount_cents || 0) - (refundedAgg._sum.amount_cents || 0),
        refunded_cents:    refundedAgg._sum.amount_cents || 0,
      },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get single payment (receipt detail) ─────────────────────
// GET /api/v1/admin/payments/:id
export const getPaymentById = async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where:   { id: req.params.id },
      include: {
        student:      { select: { id: true, email: true, first_name: true, last_name: true, phone: true } },
        plan:         { select: { plan_type: true, price_cents: true, currency: true } },
        managed_plan: {
          select: {
            id: true, name: true, tagline: true,
            credits_per_module: true,
            plan_modules: {
              orderBy: { display_order: 'asc' },
              include: { module: { select: { id: true, name: true, display_order: true } } },
            },
          },
        },
        module_enrollments: {
          include: { module: { select: { id: true, name: true, display_order: true } } },
        },
      },
    })
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' })

    const module_enrollments = await buildModuleEnrollments(payment)

    return res.json({
      success: true,
      data: { payment: { ...payment, module_enrollments } },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get audit log ────────────────────────────────────────────
// GET /api/v1/admin/audit?userId=x&action=x
export const getAuditLog = async (req, res) => {
  try {
    const { userId, targetUserId, action } = req.query
    const where = {}
    if (userId)       where.actor_id       = userId
    if (targetUserId) where.target_user_id = targetUserId
    if (action)       where.action         = action

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take:    200,
      include: {
        actor:  { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
        target: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
      },
    })
    return res.json({ success: true, data: { logs } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Post meeting link (admin) ────────────────────────────────
// POST /api/v1/admin/meetings
export const postMeetingLink = async (req, res) => {
  try {
    const { course_id, title, link, description, scheduled_at, recurring } = req.body

    if (!course_id || !title || !link) {
      return res.status(400).json({
        success: false,
        error:   'course_id, title and link are required',
      })
    }

    const meeting = await prisma.courseMeetingLink.create({
      data: {
        course_id,
        tutor_id:     null,
        title,
        link,
        description:  description || null,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
        recurring:    recurring || false,
      },
    })

    // Notify all enrolled students
    const enrollments = await prisma.enrollment.findMany({
      where:  { course_id, status: 'active' },
      select: { student_id: true },
    })

    if (enrollments.length > 0) {
      await prisma.notification.createMany({
        data: enrollments.map(e => ({
          user_id: e.student_id,
          title:   `New meeting: ${title}`,
          message: `A new meeting link has been posted for your course.`,
          type:    'info',
          sent_by: req.user.userId,
        })),
      })
    }

    await prisma.auditLog.create({
      data: {
        actor_id:    req.user.userId,
        action:      'meeting.created',
        entity_type: 'meeting',
        entity_id:   meeting.id,
        new_value:   { title, course_id, link },
      },
    }).catch(() => {})

    return res.status(201).json({ success: true, data: { meeting } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Assign tutor to course ───────────────────────────────────
// POST /api/v1/admin/courses/:courseId/tutors
export const assignTutorToCourse = async (req, res) => {
  try {
    const { courseId } = req.params
    const { tutor_id }  = req.body

    if (!tutor_id) {
      return res.status(400).json({ success: false, error: 'tutor_id is required' })
    }

    const tutor = await prisma.user.findFirst({ where: { id: tutor_id, role: 'tutor' } })
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found' })

    const existing = await prisma.courseTutor.findUnique({
      where: { course_id_tutor_id: { course_id: courseId, tutor_id } },
    })
    if (existing) return res.status(409).json({ success: false, error: 'Tutor already assigned to this course' })

    const record = await prisma.courseTutor.create({
      data: { course_id: courseId, tutor_id, assigned_by: req.user.userId },
      include: {
        tutor: { select: { id: true, first_name: true, last_name: true, email: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: tutor_id,
        action:         'tutor.course_assigned',
        entity_type:    'course_tutor',
        new_value:      { course_id: courseId, tutor_name: `${record.tutor.first_name} ${record.tutor.last_name}`, tutor_email: record.tutor.email },
      },
    }).catch(() => {})

    return res.status(201).json({ success: true, data: { record } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Remove tutor from course ─────────────────────────────────
// DELETE /api/v1/admin/courses/:courseId/tutors/:tutorId
export const removeTutorFromCourse = async (req, res) => {
  try {
    const { courseId, tutorId } = req.params
    const tutor = await prisma.user.findUnique({ where: { id: tutorId }, select: { first_name: true, last_name: true, email: true } })
    await prisma.courseTutor.delete({
      where: { course_id_tutor_id: { course_id: courseId, tutor_id: tutorId } },
    })
    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: tutorId,
        action:         'tutor.course_removed',
        entity_type:    'course_tutor',
        new_value:      { course_id: courseId, tutor_name: tutor ? `${tutor.first_name} ${tutor.last_name}` : null, tutor_email: tutor?.email },
      },
    }).catch(() => {})
    return res.json({ success: true, message: 'Tutor removed from course' })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Assign tutor to a student enrollment ─────────────────────
// POST /api/v1/admin/enrollments/:enrollmentId/assign-tutor
export const assignTutorToEnrollment = async (req, res) => {
  try {
    const { enrollmentId } = req.params
    const { tutor_id, notes } = req.body

    if (!tutor_id) return res.status(400).json({ success: false, error: 'tutor_id is required' })

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { student: { select: { id: true, first_name: true, last_name: true } } },
    })
    if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' })

    // Tutor must be assigned to this course
    const courseTutor = await prisma.courseTutor.findUnique({
      where: { course_id_tutor_id: { course_id: enrollment.course_id, tutor_id } },
    })
    if (!courseTutor) {
      return res.status(400).json({ success: false, error: 'This tutor is not assigned to the course' })
    }

    // End any existing active assignment for this enrollment
    await prisma.studentTutorAssignment.updateMany({
      where: { enrollment_id: enrollmentId, status: 'active' },
      data:  { status: 'ended', end_date: new Date() },
    })

    const tutor = await prisma.user.findUnique({
      where:  { id: tutor_id },
      select: { id: true, first_name: true, last_name: true, email: true },
    })

    const assignment = await prisma.studentTutorAssignment.create({
      data: {
        student_id:    enrollment.student_id,
        tutor_id,
        enrollment_id: enrollmentId,
        start_date:    new Date(),
        status:        'active',
        assigned_by:   req.user.userId,
        notes:         notes || null,
      },
    })

    await prisma.notification.createMany({
      data: [
        {
          user_id: enrollment.student_id,
          title:   'Tutor assigned',
          message: `${tutor.first_name} ${tutor.last_name} has been assigned as your tutor for this course.`,
          type:    'info',
          sent_by: req.user.userId,
        },
        {
          user_id: tutor_id,
          title:   'New student assigned',
          message: `${enrollment.student.first_name} ${enrollment.student.last_name} has been assigned to you for a course.`,
          type:    'info',
          sent_by: req.user.userId,
        },
      ],
    })

    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: enrollment.student_id,
        action:         'tutor.enrollment_assigned',
        entity_type:    'student_tutor_assignment',
        entity_id:      assignment.id,
        new_value:      {
          tutor_id,
          enrollment_id: enrollmentId,
          tutor_name:    `${tutor.first_name} ${tutor.last_name}`,
          student_name:  `${enrollment.student.first_name} ${enrollment.student.last_name}`,
        },
      },
    }).catch(() => {})

    return res.status(201).json({ success: true, data: { assignment } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Tint palette (deterministic by order) ───────────────────
const TINT_KEYS = ['indigo', 'violet', 'indigo', 'blue', 'teal', 'violet', 'amber', 'blue']
const monoFromTitle = (t = '') => (t.match(/\b[A-Z]/g) || []).join('').slice(0, 2).toUpperCase() || t.slice(0, 2).toUpperCase()

// ─── Get all modules (across all courses) ────────────────────
// GET /api/v1/admin/modules
// Tries new managed Module table first, falls back to CourseModule
export const getAllModules = async (req, res) => {
  try {
    // 1. Try new managed Module table
    const managedModules = await prisma.module.findMany({
      orderBy: { display_order: 'asc' },
      include: {
        plan_modules: { select: { plan_id: true } },
      },
    })

    if (managedModules.length > 0) {
      const modules = managedModules.map((m, i) => ({
        id:          m.id,
        name:        m.name,
        title:       m.name,
        blurb:       m.short_description || m.full_description || '',
        description: m.short_description || '',
        category:    m.category || '',
        cat:         m.category || '',
        credit_cost: m.credit_cost,
        credits:     m.credit_cost,
        status:      m.status,
        mono:        monoFromTitle(m.name),
        tint:        TINT_KEYS[i % TINT_KEYS.length],
        slug:        m.slug,
        display_order: m.display_order,
        plan_count:  m.plan_modules.length,
      }))
      return res.json({ success: true, data: { modules } })
    }

    // 2. Fall back to CourseModule (legacy)
    const courseModules = await prisma.courseModule.findMany({
      orderBy: { order_index: 'asc' },
      where:   { published: true },
      include: {
        module_tutors: {
          include: {
            tutor: { select: { id: true, first_name: true, last_name: true, email: true } },
          },
        },
        _count: { select: { module_enrollments: true, sessions: true } },
      },
    })

    // If still empty, return all courseModules regardless of published status
    const rows = courseModules.length > 0 ? courseModules : await prisma.courseModule.findMany({
      orderBy: { order_index: 'asc' },
      include: {
        module_tutors: { include: { tutor: { select: { id: true, first_name: true, last_name: true } } } },
        _count: { select: { module_enrollments: true, sessions: true } },
      },
    })

    const modules = rows.map((m, i) => ({
      id:          m.id,
      name:        m.title,
      title:       m.title,
      blurb:       m.description || '',
      description: m.description || '',
      category:    '',
      cat:         '',
      credit_cost: 1,
      credits:     1,
      status:      m.published ? 'published' : 'draft',
      mono:        monoFromTitle(m.title),
      tint:        TINT_KEYS[i % TINT_KEYS.length],
      order_index: m.order_index,
      enrolled:    m._count?.module_enrollments || 0,
      sessions:    m._count?.sessions || 0,
      tutor_count: m.module_tutors?.length || 0,
      tutors:      m.module_tutors?.map(mt => mt.tutor) || [],
    }))

    return res.json({ success: true, data: { modules } })
  } catch (e) {
    console.error('getAllModules error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Update module title / description / duration ────────────
// PATCH /api/v1/admin/modules/:moduleId
export const updateModule = async (req, res) => {
  try {
    const { title, description, duration_minutes, published } = req.body
    const data = {}
    if (title !== undefined)            data.title            = title
    if (description !== undefined)      data.description      = description
    if (duration_minutes !== undefined) data.duration_minutes = duration_minutes ? Number(duration_minutes) : null
    if (published !== undefined)        data.published        = Boolean(published)

    const module = await prisma.courseModule.update({
      where: { id: req.params.moduleId },
      data,
    })

    await prisma.auditLog.create({
      data: {
        actor_id:    req.user.userId,
        action:      'module.updated',
        entity_type: 'course_module',
        entity_id:   req.params.moduleId,
        new_value:   data,
      },
    })

    return res.json({ success: true, data: { module } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get tutors for a module ──────────────────────────────────
// GET /api/v1/admin/modules/:moduleId/tutors
export const getModuleTutors = async (req, res) => {
  try {
    const records = await prisma.moduleTutor.findMany({
      where: { module_id: req.params.moduleId },
      include: {
        tutor: { select: { id: true, first_name: true, last_name: true, email: true, avatar_url: true } },
      },
    })
    return res.json({ success: true, data: { tutors: records.map(r => r.tutor) } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Assign tutor to module ───────────────────────────────────
// POST /api/v1/admin/modules/:moduleId/tutors
export const assignTutorToModule = async (req, res) => {
  try {
    const { tutor_id } = req.body
    const moduleId = req.params.moduleId
    console.log('[assignTutorToModule] moduleId:', moduleId, 'tutor_id:', tutor_id)

    if (!tutor_id) return res.status(400).json({ success: false, error: 'tutor_id is required' })

    const module = await prisma.module.findUnique({ where: { id: moduleId } })
    console.log('[assignTutorToModule] module found:', !!module)
    if (!module) return res.status(404).json({ success: false, error: 'Module not found' })

    const tutor = await prisma.user.findFirst({ where: { id: tutor_id, role: 'tutor' } })
    console.log('[assignTutorToModule] tutor found:', !!tutor)
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found' })

    const record = await prisma.moduleTutor.upsert({
      where: { module_id_tutor_id: { module_id: moduleId, tutor_id } },
      update: {},
      create: { module_id: moduleId, tutor_id, assigned_by: req.user.userId },
      include: { tutor: { select: { id: true, first_name: true, last_name: true, email: true } } },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: tutor_id,
        action:         'tutor.module_assigned',
        entity_type:    'module_tutor',
        new_value:      { module_id: moduleId, module_name: module.name, tutor_name: `${tutor.first_name} ${tutor.last_name}` },
      },
    }).catch(() => {})

    return res.status(201).json({ success: true, data: { record } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Remove tutor from module ─────────────────────────────────
// DELETE /api/v1/admin/modules/:moduleId/tutors/:tutorId
export const removeTutorFromModule = async (req, res) => {
  try {
    const [mod, tutor] = await Promise.all([
      prisma.module.findUnique({ where: { id: req.params.moduleId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: req.params.tutorId }, select: { first_name: true, last_name: true, email: true } }),
    ])
    await prisma.moduleTutor.delete({
      where: { module_id_tutor_id: { module_id: req.params.moduleId, tutor_id: req.params.tutorId } },
    })
    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: req.params.tutorId,
        action:         'tutor.module_removed',
        entity_type:    'module_tutor',
        new_value:      { module_id: req.params.moduleId, module_name: mod?.name, tutor_name: tutor ? `${tutor.first_name} ${tutor.last_name}` : null },
      },
    }).catch(() => {})
    return res.json({ success: true, message: 'Tutor removed from module' })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Assign tutor to a student's module enrollment ────────────
// POST /api/v1/admin/module-enrollments/:id/assign-tutor
export const assignTutorToModuleEnrollment = async (req, res) => {
  try {
    const { tutor_id } = req.body
    if (!tutor_id) return res.status(400).json({ success: false, error: 'tutor_id is required' })

    const me = await prisma.moduleEnrollment.findUnique({ where: { id: req.params.id } })
    if (!me) return res.status(404).json({ success: false, error: 'Module enrollment not found' })

    const tutor = await prisma.user.findFirst({ where: { id: tutor_id, role: 'tutor' } })
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found' })

    const updated = await prisma.moduleEnrollment.update({
      where: { id: req.params.id },
      data:  { tutor_id },
      include: {
        module: { select: { id: true, name: true, display_order: true } },
        tutor:  { select: { id: true, first_name: true, last_name: true } },
      },
    })

    const student = await prisma.user.findUnique({ where: { id: me.student_id }, select: { id: true, first_name: true, last_name: true } })

    await prisma.notification.createMany({
      data: [
        {
          user_id: me.student_id,
          title:   'Tutor assigned to module',
          message: `${tutor.first_name} ${tutor.last_name} has been assigned as your tutor for module: ${updated.module.name}.`,
          type:    'info',
          sent_by: req.user.userId,
        },
        {
          user_id: tutor_id,
          title:   'New module student',
          message: `${student.first_name} ${student.last_name} has been assigned to you for module: ${updated.module.name}.`,
          type:    'info',
          sent_by: req.user.userId,
        },
      ],
    })

    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: me.student_id,
        action:         'tutor.module_enrollment_assigned',
        entity_type:    'module_enrollment',
        entity_id:      req.params.id,
        new_value:      {
          tutor_id,
          module_name:  updated.module.name,
          tutor_name:   `${tutor.first_name} ${tutor.last_name}`,
          student_name: `${student.first_name} ${student.last_name}`,
        },
      },
    }).catch(() => {})

    return res.status(200).json({ success: true, data: { enrollment: updated } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Refund module credits for a student ─────────────────────
// POST /api/v1/admin/students/:studentId/modules/:moduleId/refund-credits
export const refundModuleCredits = async (req, res) => {
  try {
    const { studentId, moduleId } = req.params
    const { credits = 5, reason } = req.body

    const [credit, studentInfo, moduleInfo] = await Promise.all([
      prisma.moduleCredit.findUnique({ where: { student_id_module_id: { student_id: studentId, module_id: moduleId } } }),
      prisma.user.findUnique({ where: { id: studentId }, select: { first_name: true, last_name: true, email: true } }),
      prisma.module.findUnique({ where: { id: moduleId }, select: { name: true } }).catch(() => null),
    ])

    if (!credit) return res.status(404).json({ success: false, error: 'No credit record found for this student+module' })

    const updated = await prisma.moduleCredit.update({
      where: { student_id_module_id: { student_id: studentId, module_id: moduleId } },
      data:  {
        credits_granted: Math.max(0, credit.credits_granted - credits),
        credits_used:    Math.max(0, Math.min(credit.credits_used, credit.credits_granted - credits)),
      },
    })

    await prisma.notification.create({
      data: {
        user_id: studentId,
        title:   'Session credits adjusted',
        message: `Admin has adjusted your session credits for a module.${reason ? ` Reason: ${reason}` : ''}`,
        type:    'info',
        sent_by: req.user.userId,
      },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: studentId,
        action:         'module_credit.refunded',
        entity_type:    'module_credit',
        ip_address:     req.ip || null,
        old_value:      { credits_granted: credit.credits_granted, credits_used: credit.credits_used },
        new_value:      {
          credits_deducted: credits,
          reason:           reason || null,
          student_name:     studentInfo ? `${studentInfo.first_name} ${studentInfo.last_name}` : null,
          student_email:    studentInfo?.email || null,
          module_name:      moduleInfo?.name   || null,
          after:            { credits_granted: updated.credits_granted, credits_used: updated.credits_used },
        },
      },
    })

    return res.json({ success: true, data: { credit: updated }, message: `${credits} credit(s) removed` })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get student module credits ───────────────────────────────
// GET /api/v1/admin/students/:studentId/credits
export const getStudentCredits = async (req, res) => {
  try {
    const credits = await prisma.moduleCredit.findMany({
      where:   { student_id: req.params.studentId },
      orderBy: { module: { display_order: 'asc' } },
      include: {
        module: { select: { id: true, name: true, display_order: true } },
      },
    })
    return res.json({ success: true, data: { credits } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get all module enrollments (filterable) ──────────────────
// GET /api/v1/admin/module-enrollments?courseId=x&studentId=x
export const getModuleEnrollments = async (req, res) => {
  try {
    const { courseId, studentId, moduleId } = req.query
    const where = {}
    if (courseId)  where.course_id  = courseId
    if (studentId) where.student_id = studentId
    if (moduleId)  where.module_id  = moduleId

    const enrollments = await prisma.moduleEnrollment.findMany({
      where,
      orderBy: { enrolled_at: 'desc' },
      include: {
        student: { select: { id: true, first_name: true, last_name: true, email: true } },
        module:  { select: { id: true, name: true, display_order: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true } },
      },
    })
    return res.json({ success: true, data: { enrollments } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

export { getTutorCalendar as getTutorCalendarAdmin }

// ─── Payroll: get completed sessions in date range grouped by tutor ───
// GET /api/v1/admin/payroll?from=YYYY-MM-DD&to=YYYY-MM-DD
export const getPayroll = async (req, res) => {
  try {
    const { from, to } = req.query
    const where = { status: 'completed' }
    if (from) where.scheduled_date = { ...(where.scheduled_date||{}), gte: new Date(from) }
    if (to)   where.scheduled_date = { ...(where.scheduled_date||{}), lte: new Date(to) }

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { scheduled_date: 'desc' },
      include: {
        tutor:   { select: { id:true, first_name:true, last_name:true, email:true, tutor_profile: { select: { pay_rate_cents:true } } } },
        student: { select: { id:true, first_name:true, last_name:true } },
        module:  { select: { id:true, name:true, display_order:true } },
      },
    })

    // Group by tutor
    const byTutor = {}
    for (const s of sessions) {
      const tid = s.tutor_id
      if (!byTutor[tid]) {
        byTutor[tid] = {
          tutor:       s.tutor,
          pay_rate_cents: s.tutor?.tutor_profile?.pay_rate_cents ?? 0,
          sessions:    [],
          total_minutes: 0,
          unpaid_cents: 0,
          paid_cents:   0,
        }
      }
      byTutor[tid].sessions.push(s)
      byTutor[tid].total_minutes += s.duration_minutes || 0
      if (s.tutor_paid) {
        byTutor[tid].paid_cents += s.tutor_pay_cents || 0
      } else {
        const rate = byTutor[tid].pay_rate_cents
        byTutor[tid].unpaid_cents += rate > 0 ? Math.round(rate * (s.duration_minutes || 0) / 60) : 0
      }
    }

    return res.json({ success:true, data: { tutors: Object.values(byTutor) } })
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message })
  }
}

// ─── Payroll: mark a session as paid ─────────────────────────────────
// PATCH /api/v1/admin/payroll/sessions/:sessionId/pay
export const paySession = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { sessionId } = req.params
    const { pay_cents } = req.body

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { tutor: { select: { id:true, first_name:true, last_name:true } } },
    })
    if (!session) return res.status(404).json({ success:false, error:'Session not found' })
    if (session.status !== 'completed') return res.status(400).json({ success:false, error:'Only completed sessions can be paid' })
    if (session.tutor_paid) return res.status(400).json({ success:false, error:'Already paid' })

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { tutor_paid:true, tutor_paid_at:new Date(), tutor_paid_by:adminId, tutor_pay_cents: pay_cents || 0 },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:    adminId,
        action:      'payroll.session.paid',
        entity_type: 'session',
        entity_id:   sessionId,
        new_value:   { tutor_id:session.tutor_id, pay_cents: pay_cents || 0 },
      },
    })

    await prisma.notification.create({
      data: {
        user_id: session.tutor_id,
        title:   'Session payment processed',
        message: `You have been paid for your session on ${new Date(session.scheduled_date).toLocaleDateString()}.`,
        type:    'info',
        sent_by: adminId,
      },
    })

    return res.json({ success:true, data:{ session:updated } })
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message })
  }
}

// ─── Payroll: update tutor pay rate ──────────────────────────────────
// PATCH /api/v1/admin/tutors/:tutorId/pay-rate
export const updateTutorPayRate = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { tutorId } = req.params
    const pay_rate_cents          = Number(req.body.pay_rate_cents ?? req.body.rate ?? 0)
    const weekly_base_pay_cents   = req.body.weekly_base_pay_cents != null
      ? Number(req.body.weekly_base_pay_cents)
      : undefined

    const existing = await prisma.tutorProfile.findUnique({ where: { tutor_id: tutorId } })

    const updateData = { pay_rate_cents }
    if (weekly_base_pay_cents !== undefined) updateData.weekly_base_pay_cents = weekly_base_pay_cents

    const profile = existing
      ? await prisma.tutorProfile.update({
          where: { tutor_id: tutorId },
          data:  updateData,
        })
      : await prisma.tutorProfile.create({
          data: { tutor_id: tutorId, ...updateData },
        })

    await prisma.auditLog.create({
      data: {
        actor_id:       adminId,
        target_user_id: tutorId,
        action:         'payroll.pay_rate',
        entity_type:    'tutor_profile',
        entity_id:      profile.id,
        old_value:      { pay_rate_cents: existing?.pay_rate_cents ?? null, weekly_base_pay_cents: existing?.weekly_base_pay_cents ?? null },
        new_value:      { pay_rate_cents, weekly_base_pay_cents: profile.weekly_base_pay_cents, reason: req.body.reason || null },
      },
    })

    return res.json({ success: true, data: { profile } })
  } catch (e) {
    console.error('updateTutorPayRate error:', e)
    return res.status(500).json({ success:false, error:e.message })
  }
}

// ─── Analytics ────────────────────────────────────────────────────────
// GET /api/v1/admin/analytics?days=180
export const getAnalytics = async (req, res) => {
  try {
    const days  = Number(req.query.days || 180)
    const from  = req.query.from ? new Date(req.query.from) : (() => { const d = new Date(); d.setDate(d.getDate() - days); return d })()
    const to    = req.query.to   ? new Date(req.query.to + 'T23:59:59Z') : new Date()

    const [
      revenueByMonth,
      revenueByPlan,
      signupsByMonth,
      totalStudentsAllTime,
      subscribedAllTime,
      newSignups,
      newSubscribers,
      topStudents,
      topTutors,
      tutorRatings,
      sessionsByModule,
      sessionsByMonth,
      moduleEnrollments,
    ] = await Promise.all([

      // Revenue per month — gross and refunded
      prisma.$queryRaw`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM') AS month,
          SUM(amount_cents) FILTER (WHERE status IN ('succeeded', 'refunded')) AS gross_cents,
          SUM(amount_cents) FILTER (WHERE status = 'refunded')                AS refunded_cents,
          COUNT(*)          FILTER (WHERE status IN ('succeeded', 'refunded')) AS payment_count,
          COUNT(*)          FILTER (WHERE status = 'refunded')                AS refund_count
        FROM payments
        WHERE created_at BETWEEN ${from} AND ${to}
        GROUP BY month ORDER BY month ASC
      `,

      // Revenue by plan (managed + legacy)
      prisma.$queryRaw`
        SELECT
          COALESCE(pl.name, pp.plan_type::text, 'Unknown')                              AS plan_name,
          COUNT(*) FILTER (WHERE pay.status IN ('succeeded', 'refunded'))                AS purchase_count,
          SUM(pay.amount_cents) FILTER (WHERE pay.status IN ('succeeded', 'refunded'))   AS gross_cents,
          SUM(pay.amount_cents) FILTER (WHERE pay.status = 'refunded')                  AS refunded_cents
        FROM payments pay
        LEFT JOIN plans         pl ON pl.id = pay.managed_plan_id
        LEFT JOIN pricing_plans pp ON pp.id = pay.plan_id
        WHERE pay.status IN ('succeeded', 'refunded')
          AND pay.created_at BETWEEN ${from} AND ${to}
        GROUP BY plan_name
        ORDER BY gross_cents DESC
        LIMIT 10
      `,

      // Student signups per month
      prisma.$queryRaw`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM') AS month,
          COUNT(*) AS count
        FROM users
        WHERE role = 'student' AND created_at BETWEEN ${from} AND ${to}
        GROUP BY month ORDER BY month ASC
      `,

      // All-time total students
      prisma.user.count({ where: { role: 'student' } }),

      // All-time subscribed (at least one succeeded payment ever)
      prisma.payment.groupBy({ by: ['student_id'], where: { status: 'succeeded' } }).then(r => r.length),

      // New signups in period
      prisma.user.count({ where: { role: 'student', created_at: { gte: from, lte: to } } }),

      // New subscribers in period (distinct student_ids who paid)
      prisma.payment.groupBy({ by: ['student_id'], where: { status: 'succeeded', created_at: { gte: from, lte: to } } }).then(r => r.length),

      // Top 10 paying students in period
      prisma.payment.groupBy({
        by: ['student_id'], where: { status: 'succeeded', created_at: { gte: from, lte: to } },
        _sum: { amount_cents: true }, orderBy: { _sum: { amount_cents: 'desc' } }, take: 10,
      }).then(async rows => {
        const ids   = rows.map(r => r.student_id)
        const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, first_name: true, last_name: true, email: true } })
        const map   = Object.fromEntries(users.map(u => [u.id, u]))
        return rows.map(r => ({ ...map[r.student_id], total_cents: r._sum.amount_cents }))
      }),

      // Top 10 tutors by completed sessions in period
      prisma.session.groupBy({
        by: ['tutor_id'], where: { status: 'completed', scheduled_date: { gte: from, lte: to } },
        _count: { id: true }, _sum: { duration_minutes: true }, orderBy: { _count: { id: 'desc' } }, take: 10,
      }).then(async rows => {
        const ids   = rows.map(r => r.tutor_id)
        const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, first_name: true, last_name: true } })
        const map   = Object.fromEntries(users.map(u => [u.id, u]))
        return rows.map(r => ({ ...map[r.tutor_id], sessions: r._count.id, hours: Math.round((r._sum.duration_minutes || 0) / 60 * 10) / 10 }))
      }),

      // Top 10 tutors by rating (all time)
      prisma.tutorReview.groupBy({
        by: ['tutor_id'], _avg: { rating: true }, _count: { id: true }, orderBy: { _avg: { rating: 'desc' } }, take: 10,
      }).then(async rows => {
        const ids   = rows.map(r => r.tutor_id)
        const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, first_name: true, last_name: true } })
        const map   = Object.fromEntries(users.map(u => [u.id, u]))
        return rows.map(r => ({ ...map[r.tutor_id], avg_rating: Math.round((r._avg.rating || 0) * 10) / 10, review_count: r._count.id }))
      }),

      // Sessions by module in period (all statuses)
      prisma.session.groupBy({
        by: ['module_id'],
        where: { module_id: { not: null }, scheduled_date: { gte: from, lte: to } },
        _count: { id: true }, _sum: { duration_minutes: true }, orderBy: { _count: { id: 'desc' } }, take: 20,
      }).then(async rows => {
        const ids  = rows.filter(r => r.module_id).map(r => r.module_id)
        const mods = await prisma.module.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        const map  = Object.fromEntries(mods.map(m => [m.id, m]))
        // Per-module completion/cancellation
        const statRows = await prisma.session.groupBy({
          by: ['module_id', 'status'],
          where: { module_id: { in: ids }, scheduled_date: { gte: from, lte: to } },
          _count: { id: true },
        })
        const statMap = {}
        statRows.forEach(r => {
          if (!statMap[r.module_id]) statMap[r.module_id] = {}
          statMap[r.module_id][r.status] = r._count.id
        })
        return rows.filter(r => r.module_id).map(r => {
          const s = statMap[r.module_id] || {}
          const total = r._count.id
          return {
            ...map[r.module_id],
            sessions:           total,
            completed:          s.completed || 0,
            cancelled:          s.cancelled || 0,
            hours:              Math.round((r._sum.duration_minutes || 0) / 60 * 10) / 10,
            completion_rate:    total > 0 ? Math.round((s.completed || 0) / total * 1000) / 10 : 0,
          }
        })
      }),

      // Sessions per month
      prisma.$queryRaw`
        SELECT
          TO_CHAR(scheduled_date, 'YYYY-MM') AS month,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
          COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
          COUNT(*)                                     AS total
        FROM sessions
        WHERE scheduled_date BETWEEN ${from}::date AND ${to}::date
        GROUP BY month ORDER BY month ASC
      `,

      // Module enrollments in period
      prisma.$queryRaw`
        SELECT
          m.id          AS module_id,
          m.name        AS module_name,
          COUNT(me.id)  FILTER (WHERE me.status = 'active')    AS active_count,
          COUNT(me.id)  FILTER (WHERE me.status = 'cancelled') AS cancelled_count,
          COUNT(me.id)                                         AS enrolled_count
        FROM module_enrollments me
        JOIN modules m ON m.id = me.module_id
        WHERE me.enrolled_at BETWEEN ${from} AND ${to}
        GROUP BY m.id, m.name
        ORDER BY enrolled_count DESC
        LIMIT 20
      `,
    ])

    // ── Aggregate totals ──────────────────────────────────────────
    const totalGross    = revenueByMonth.reduce((s, r) => s + Number(r.gross_cents    || 0), 0)
    const totalRefunded = revenueByMonth.reduce((s, r) => s + Number(r.refunded_cents || 0), 0)
    const totalPayments = revenueByMonth.reduce((s, r) => s + Number(r.payment_count  || 0), 0)
    const totalRefunds  = revenueByMonth.reduce((s, r) => s + Number(r.refund_count   || 0), 0)

    const sessTotals = sessionsByMonth.reduce((s, r) => ({
      completed: s.completed + Number(r.completed || 0),
      cancelled: s.cancelled + Number(r.cancelled || 0),
      total:     s.total     + Number(r.total     || 0),
    }), { completed: 0, cancelled: 0, total: 0 })

    const allRatings = tutorRatings.map(t => t.avg_rating).filter(Boolean)
    const avgRating  = allRatings.length ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0

    const pct = (n, d) => d > 0 ? Math.round(n / d * 1000) / 10 : 0

    return res.json({
      success: true,
      data: {
        period: { from: from.toISOString(), to: to.toISOString(), days },
        revenue: {
          total_gross:    totalGross    / 100,
          total_refunded: totalRefunded / 100,
          net:            (totalGross - totalRefunded) / 100,
          refund_count:   totalRefunds,
          payment_count:  totalPayments,
          refund_rate:    pct(totalRefunds, totalPayments),
          by_month: revenueByMonth.map(r => ({
            month:    r.month,
            m:        r.month?.slice(5) || '',
            gross:    Number(r.gross_cents    || 0) / 100,
            refunded: Number(r.refunded_cents || 0) / 100,
            net:      (Number(r.gross_cents || 0) - Number(r.refunded_cents || 0)) / 100,
          })),
          by_plan: revenueByPlan.map(r => ({
            plan_name:      r.plan_name,
            purchase_count: Number(r.purchase_count || 0),
            gross:          Number(r.gross_cents    || 0) / 100,
            refunded:       Number(r.refunded_cents || 0) / 100,
            net:            (Number(r.gross_cents || 0) - Number(r.refunded_cents || 0)) / 100,
          })),
        },
        students: {
          total_alltime:       totalStudentsAllTime,
          subscribed_alltime:  subscribedAllTime,
          alltime_conversion:  pct(subscribedAllTime, totalStudentsAllTime),
          new_signups:         newSignups,
          new_subscribers:     newSubscribers,
          period_conversion:   pct(newSubscribers, newSignups),
          signups_by_month:    signupsByMonth.map(r => ({ month: r.month, m: r.month?.slice(5) || '', count: Number(r.count || 0) })),
          top_paying:          topStudents,
        },
        sessions: {
          total:             sessTotals.total,
          completed:         sessTotals.completed,
          cancelled:         sessTotals.cancelled,
          completion_rate:   pct(sessTotals.completed, sessTotals.total),
          cancellation_rate: pct(sessTotals.cancelled, sessTotals.total),
          by_month: sessionsByMonth.map(r => ({
            month:     r.month,
            m:         r.month?.slice(5) || '',
            completed: Number(r.completed || 0),
            cancelled: Number(r.cancelled || 0),
            pending:   Number(r.pending   || 0),
            confirmed: Number(r.confirmed || 0),
            total:     Number(r.total     || 0),
          })),
          by_module: sessionsByModule,
        },
        modules: {
          by_enrollment: moduleEnrollments.map(r => ({
            module_id:      r.module_id,
            module_name:    r.module_name,
            enrolled_count: Number(r.enrolled_count || 0),
            active_count:   Number(r.active_count   || 0),
            cancelled_count:Number(r.cancelled_count|| 0),
          })),
        },
        leaderboards: {
          top_students:  topStudents,
          top_tutors:    topTutors,
          tutor_ratings: tutorRatings,
        },
        avg_rating:     Math.round(avgRating * 100) / 100,
        // legacy compat
        total_revenue:  (totalGross - totalRefunded) / 100,
        total_sessions: sessTotals.total,
        monthly_revenue: revenueByMonth.map(r => ({ month: r.month, m: r.month?.slice(5) || '', gross: Number(r.gross_cents || 0) / 100, revenue: Number(r.gross_cents || 0) / 100 })),
      },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get tutor sessions for payroll ───────────────────────────
// GET /api/v1/admin/tutor-sessions[?tutor_id=X&week=YYYY-MM-DD]
export const getTutorSessions = async (req, res) => {
  try {
    const { tutor_id, week } = req.query
    const where = { status: 'completed' }
    if (tutor_id) where.tutor_id = tutor_id
    // If week is provided, filter by that week's Monday → Sunday
    if (week) {
      const weekStart = new Date(week + 'T00:00:00')
      const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7)
      where.scheduled_date = { gte: weekStart, lt: weekEnd }
    }

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { scheduled_date: 'desc' },
      take:    500,
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true, tutor_profile: { select: { pay_rate_cents: true } } } },
        module:  { select: { id: true, name: true } },
        course:  { select: { id: true, title: true } },
      },
    })

    return res.json({
      success: true,
      data: {
        sessions: sessions.map(s => {
          // For paid sessions use the recorded amount; for unpaid calculate from the tutor's current rate
          let tutor_fee
          if (s.tutor_paid && s.tutor_pay_cents != null) {
            tutor_fee = s.tutor_pay_cents / 100
          } else {
            const rateCents = s.tutor?.tutor_profile?.pay_rate_cents ?? 0
            tutor_fee = rateCents > 0
              ? Math.round(rateCents * (s.duration_minutes || 0) / 60) / 100
              : 0
          }
          return {
            id:                 s.id,
            subject:            s.subject,
            scheduled_date:     s.scheduled_date,
            start_time:         s.start_time,
            duration_minutes:   s.duration_minutes,
            status:             s.status,
            tutor_id:           s.tutor_id,
            tutor_paid:         s.tutor_paid,
            tutor_fee,
            module_name:        s.module?.name || s.course?.title || '',
            student_first_name: s.student?.first_name,
            student_last_name:  s.student?.last_name,
            tutor:              s.tutor,
            student:            s.student,
          }
        }),
      },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Bulk pay sessions for a tutor ───────────────────────────
// POST /api/v1/admin/payroll/pay
// Body: { tutor_id, session_ids }
export const bulkPaySessions = async (req, res) => {
  try {
    const adminId           = req.user.userId
    const { tutor_id, session_ids } = req.body

    if (!tutor_id || !Array.isArray(session_ids) || session_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'tutor_id and session_ids[] are required' })
    }

    // Fetch the tutor's current pay rate so we can stamp it on each session
    const [tutorUser, tutorProfile] = await Promise.all([
      prisma.user.findUnique({ where: { id: tutor_id }, select: { first_name: true, last_name: true, email: true } }),
      prisma.tutorProfile.findUnique({ where: { tutor_id }, select: { pay_rate_cents: true } }),
    ])
    const payRateCents = tutorProfile?.pay_rate_cents ?? 0

    // Fetch the sessions to know each session's duration
    const sessionsToUpdate = await prisma.session.findMany({
      where: { id: { in: session_ids }, tutor_id, status: 'completed', tutor_paid: false },
      select: { id: true, duration_minutes: true },
    })

    // Update each session individually so we can record the per-session fee
    await Promise.all(
      sessionsToUpdate.map(s => {
        const feeCents = payRateCents > 0 ? Math.round(payRateCents * (s.duration_minutes || 0) / 60) : 0
        return prisma.session.update({
          where: { id: s.id },
          data: {
            tutor_paid:     true,
            tutor_paid_at:  new Date(),
            tutor_paid_by:  adminId,
            tutor_pay_cents: feeCents,
          },
        })
      })
    )

    const result = { count: sessionsToUpdate.length }
    const tutor  = tutorUser

    const totalPayCents = sessionsToUpdate.reduce((sum, s) =>
      sum + (payRateCents > 0 ? Math.round(payRateCents * (s.duration_minutes || 0) / 60) : 0), 0)

    await prisma.auditLog.create({
      data: {
        actor_id:    adminId,
        action:      'payroll.bulk_pay',
        entity_type: 'session',
        ip_address:  req.ip || null,
        new_value:   {
          tutor_id,
          session_ids,
          count:           result.count,
          tutor_name:      `${tutor?.first_name} ${tutor?.last_name}`,
          tutor_email:     tutor?.email     || null,
          total_pay_cents: totalPayCents,
          pay_rate_cents:  payRateCents,
        },
      },
    })

    return res.json({ success: true, data: { paid_count: result.count } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: get all support tickets ───────────────────────────
// GET /api/v1/admin/support-tickets
export const adminGetSupportTickets = async (req, res) => {
  try {
    const { status } = req.query
    const where = status ? { status } : {}

    const tickets = await prisma.supportTicket.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take:    100,
      include: {
        student:  { select: { id: true, first_name: true, last_name: true, email: true } },
        messages: {
          orderBy: { created_at: 'asc' },
          include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } },
        },
      },
    })

    const total = await prisma.supportTicket.count({ where })

    return res.json({
      success: true,
      data:    {
        tickets: tickets.map(t => ({
          ...t,
          user:       t.student,
          subject:    t.title,
          message:    t.messages[0]?.content || '',
          last_reply: t.messages.filter(m => m.sender?.role !== 'student').pop()?.content || null,
        })),
        total,
      },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: reply to support ticket ──────────────────────────
// POST /api/v1/admin/support-tickets/:id/reply
export const adminReplyToSupportTicket = async (req, res) => {
  try {
    const adminId  = req.user.userId
    const ticketId = req.params.id
    const { message } = req.body

    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' })
    }

    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' })

    const msg = await prisma.supportMessage.create({
      data: {
        ticket_id:   ticketId,
        sender_id:   adminId,
        content:     message,
        is_internal: false,
      },
    })

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data:  { status: 'resolved', assigned_admin_id: adminId, resolved_at: new Date() },
    })

    // Notify student
    await prisma.notification.create({
      data: {
        user_id: ticket.student_id,
        title:   'Support ticket updated',
        message: `Your ticket "${ticket.title}" has received a reply.`,
        type:    'info',
        sent_by: adminId,
      },
    })

    return res.json({ success: true, data: { message: msg } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: broadcast notification ───────────────────────────
// POST /api/v1/admin/notifications/broadcast
// Body: { audience: 'students'|'tutors'|'all', subject, body }
export const broadcastNotification = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { audience, subject, body, title } = req.body

    const notifTitle   = title   || subject
    const notifMessage = body    || subject

    if (!notifTitle || !audience) {
      return res.status(400).json({ success: false, error: 'audience and subject/title are required' })
    }

    const roleMap = { students: 'student', tutors: 'tutor' }
    const where   = audience === 'all' ? { suspended: false } : { role: roleMap[audience] || audience, suspended: false }

    const recipients = await prisma.user.findMany({ where, select: { id: true } })

    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No recipients found' })
    }

    await prisma.notification.createMany({
      data: recipients.map(r => ({
        user_id: r.id,
        title:   notifTitle,
        message: notifMessage,
        type:    'info',
        sent_by: adminId,
      })),
    })

    await prisma.auditLog.create({
      data: {
        actor_id:    adminId,
        action:      'notification.broadcast',
        entity_type: 'notification',
        new_value:   { audience, subject: notifTitle, recipient_count: recipients.length },
      },
    })

    return res.json({
      success: true,
      message: `Notification sent to ${recipients.length} user(s)`,
      data:    { sent_count: recipients.length },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: refund payment ─────────────────────────────────────
// POST /api/v1/admin/payments/:id/refund
export const adminRefundPaymentAlias = async (req, res) => {
  try {
    const adminId   = req.user.userId
    const paymentId = req.params.id

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' })
    if (payment.status === 'refunded') {
      return res.status(400).json({ success: false, error: 'Payment already refunded' })
    }

    await prisma.payment.update({
      where: { id: paymentId },
      data:  { status: 'refunded', refunded_at: new Date() },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:       adminId,
        target_user_id: payment.student_id,
        action:         'payment.refund',
        entity_type:    'payment',
        entity_id:      paymentId,
        new_value:      { amount_cents: payment.amount_cents, reason: req.body.reason || 'Admin refund' },
      },
    })

    return res.json({ success: true, message: 'Payment refunded', data: { payment_id: paymentId } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Student detail with credit management ────────────────────────────
// GET /api/v1/admin/students/:studentId
export const getStudentDetail = async (req, res) => {
  try {
    const { studentId } = req.params

    const [student, payments, sessions, moduleEnrollments] = await Promise.all([
      prisma.user.findUnique({
        where: { id:studentId },
        select: { id:true, first_name:true, last_name:true, email:true, username:true, created_at:true, suspended:true, suspended_reason:true, onboarded:true },
      }),
      prisma.payment.findMany({
        where:   { student_id:studentId },
        orderBy: { created_at:'desc' },
        include: {
          plan:         { select:{ plan_type:true, price_cents:true } },
          managed_plan: { select:{ id:true, name:true } },
        },
      }),
      prisma.session.findMany({
        where:   { student_id:studentId },
        orderBy: { scheduled_date:'desc' },
        include: {
          tutor:  { select:{ id:true, first_name:true, last_name:true, username:true } },
          module: { select:{ id:true, name:true, display_order:true } },
        },
      }),
      prisma.moduleEnrollment.findMany({
        where:   { student_id:studentId },
        include: {
          module:  { select:{ id:true, name:true, display_order:true } },
          tutor:   { select:{ id:true, first_name:true, last_name:true } },
        },
      }).then(async enrollments => {
        const moduleIds = enrollments.map(e => e.module_id)
        const credits = await prisma.moduleCredit.findMany({ where:{ student_id:studentId, module_id:{ in:moduleIds } } })
        const creditMap = Object.fromEntries(credits.map(c => [c.module_id, c]))
        return enrollments.map(e => ({ ...e, credit: creditMap[e.module_id] || null }))
      }),
    ])

    if (!student) return res.status(404).json({ success:false, error:'Student not found' })

    return res.json({ success:true, data:{ student, payments, sessions, module_enrollments:moduleEnrollments } })
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message })
  }
}

// ─── Admin adjust student credits ────────────────────────────────────
// POST /api/v1/admin/students/:studentId/modules/:moduleId/credits
export const adjustCredits = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { studentId, moduleId } = req.params
    const { action, amount, reason } = req.body  // action: 'add' | 'deduct'

    if (!['add','deduct'].includes(action)) return res.status(400).json({ success:false, error:'action must be add or deduct' })
    if (!amount || amount < 1) return res.status(400).json({ success:false, error:'amount must be >= 1' })
    if (!reason?.trim()) return res.status(400).json({ success:false, error:'reason is required' })

    const [credit, studentInfo, moduleInfo] = await Promise.all([
      prisma.moduleCredit.findUnique({ where:{ student_id_module_id:{ student_id:studentId, module_id:moduleId } } }),
      prisma.user.findUnique({ where:{ id:studentId }, select:{ first_name:true, last_name:true, email:true } }),
      prisma.module.findUnique({ where:{ id:moduleId }, select:{ name:true } }).catch(() => null),
    ])
    if (!credit) return res.status(404).json({ success:false, error:'No credit record for this student/module' })

    const oldVal = { credits_granted:credit.credits_granted, credits_used:credit.credits_used }
    let updated

    if (action === 'add') {
      updated = await prisma.moduleCredit.update({
        where: { student_id_module_id:{ student_id:studentId, module_id:moduleId } },
        data:  { credits_granted:{ increment:amount } },
      })
    } else {
      const canDeduct = credit.credits_granted - credit.credits_used
      if (amount > canDeduct) return res.status(400).json({ success:false, error:`Cannot deduct ${amount} — only ${canDeduct} remaining` })
      updated = await prisma.moduleCredit.update({
        where: { student_id_module_id:{ student_id:studentId, module_id:moduleId } },
        data:  { credits_used:{ increment:amount } },
      })
    }

    await prisma.auditLog.create({
      data: {
        actor_id:       adminId,
        target_user_id: studentId,
        action:         `credits.${action}`,
        entity_type:    'module_credit',
        ip_address:     req.ip || null,
        old_value:      oldVal,
        new_value:      {
          action,
          amount,
          reason,
          module_id:     moduleId,
          module_name:   moduleInfo?.name   || null,
          student_name:  studentInfo ? `${studentInfo.first_name} ${studentInfo.last_name}` : null,
          student_email: studentInfo?.email || null,
          after:         { credits_granted:updated.credits_granted, credits_used:updated.credits_used },
        },
      },
    })

    return res.json({ success:true, data:{ credit:updated } })
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message })
  }
}

// ─── Payment records (TutorPayout ledger) ─────────────────────
// GET /api/v1/admin/payment-records
export const getPaymentRecords = async (req, res) => {
  try {
    const payouts = await prisma.tutorPayout.findMany({
      orderBy: { paid_at: 'desc' },
      take:    500,
      include: {
        tutor: { select: { id: true, first_name: true, last_name: true, email: true } },
        admin: { select: { id: true, first_name: true, last_name: true } },
      },
    })
    return res.json({ success: true, data: { records: payouts } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get tutor detail for admin (sessions + profile) ─────────
// GET /api/v1/admin/tutors/:id/detail
export const getTutorDetail = async (req, res) => {
  try {
    const tutorId = req.params.id
    const [user, sessions, profile, banking, payouts] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: tutorId },
        select: {
          id: true, first_name: true, last_name: true, email: true,
          bio: true, avatar_url: true, created_at: true,
          suspended: true, suspended_reason: true,
          reviews_received: { select: { rating: true } },
          module_tutor_slots: {
            include: { module: { select: { id: true, name: true, display_order: true } } },
          },
        },
      }),
      prisma.session.findMany({
        where:   { tutor_id: tutorId, status: 'completed' },
        orderBy: { scheduled_date: 'desc' },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          module:  { select: { id: true, name: true } },
        },
      }),
      prisma.tutorProfile.findUnique({ where: { tutor_id: tutorId } }).catch(() => null),
      prisma.tutorBankingDetails.findUnique({
        where:   { tutor_id: tutorId },
        include: { verifier: { select: { id: true, first_name: true, last_name: true } } },
      }).catch(() => null),
      prisma.tutorPayout.findMany({
        where:   { tutor_id: tutorId },
        include: { admin: { select: { id: true, first_name: true, last_name: true } } },
        orderBy: { paid_at: 'desc' },
      }).catch(() => []),
    ])

    if (!user) return res.status(404).json({ success: false, error: 'Tutor not found' })

    const ratings     = user.reviews_received.map(r => r.rating)
    const avgRating   = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
    const payRateCents    = profile?.pay_rate_cents || 0
    const weeklyBaseCents = profile?.weekly_base_pay_cents || 0

    // Group sessions by week
    const byWeek = {}
    for (const s of sessions) {
      const d    = new Date((s.scheduled_date?.toISOString() || '').slice(0, 10) + 'T00:00:00')
      const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
      d.setDate(d.getDate() + diff)
      const wk = d.toISOString().slice(0, 10)
      if (!byWeek[wk]) byWeek[wk] = []
      byWeek[wk].push(s)
    }

    const totalPaidCents   = payouts.reduce((s, p) => s + p.amount_cents, 0)
    const unpaidSessionAmt = sessions.filter(s => !s.tutor_paid)
      .reduce((s, sess) => s + Math.round(payRateCents * (sess.duration_minutes || 0) / 60), 0)

    return res.json({
      success: true,
      data: {
        tutor: {
          id:            user.id,
          first_name:    user.first_name,
          last_name:     user.last_name,
          email:         user.email,
          bio:           user.bio,
          avatar_url:    user.avatar_url,
          created_at:    user.created_at,
          suspended:     user.suspended,
          suspended_reason: user.suspended_reason,
          average_rating: avgRating ? parseFloat(avgRating.toFixed(2)) : null,
          review_count:  ratings.length,
          pay_rate:             payRateCents / 100,
          weekly_base_pay:      weeklyBaseCents / 100,
          pay_rate_cents:       payRateCents,
          weekly_base_pay_cents: weeklyBaseCents,
          modules:       user.module_tutor_slots.map(s => ({ id: s.module.id, name: s.module.name })),
        },
        banking,
        payouts,
        payout_summary: {
          total_paid_cents:   totalPaidCents,
          unpaid_session_cents: unpaidSessionAmt,
        },
        sessions,
        sessions_by_week: Object.entries(byWeek)
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([week, ss]) => ({
            week,
            sessions: ss.map(s => {
              const feeCents = s.tutor_paid && s.tutor_pay_cents != null
                ? s.tutor_pay_cents
                : Math.round(payRateCents * (s.duration_minutes || 0) / 60)
              return {
                id:                s.id,
                subject:           s.subject,
                scheduled_date:    s.scheduled_date,
                duration_minutes:  s.duration_minutes,
                tutor_paid:        s.tutor_paid,
                tutor_fee:         feeCents / 100,
                module_name:       s.module?.name || '',
                student_id:        s.student?.id || null,
                student_name:      `${s.student?.first_name || ''} ${s.student?.last_name || ''}`.trim(),
              }
            }),
          })),
      },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Pending tutor approvals ───────────────────────────────────
export const getPendingTutors = async (req, res) => {
  try {
    const tutors = await prisma.user.findMany({
      where:   { role: 'tutor', approved: false },
      orderBy: { created_at: 'desc' },
      select:  { id: true, first_name: true, last_name: true, email: true, created_at: true },
    })
    return res.json({ success: true, data: { tutors } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

export const approveTutor = async (req, res) => {
  try {
    const tutor = await prisma.user.update({
      where: { id: req.params.id },
      data:  { approved: true },
      select: { id: true, first_name: true, last_name: true, email: true },
    })
    await Promise.all([
      prisma.notification.create({
        data: {
          user_id: tutor.id,
          title:   'Account approved',
          message: 'Your tutor account has been approved. You can now log in and start teaching.',
          type:    'info',
        },
      }).catch(() => {}),
      prisma.auditLog.create({
        data: {
          actor_id:       req.user.userId,
          target_user_id: tutor.id,
          action:         'tutor.approved',
          entity_type:    'user',
          entity_id:      tutor.id,
          new_value:      { tutor_name: `${tutor.first_name} ${tutor.last_name}`, email: tutor.email },
        },
      }).catch(() => {}),
    ])

    // Welcome + getting-started email — non-blocking
    emailService.sendTutorWelcome(tutor.email, tutor.first_name)
      .catch(err => console.error('Tutor welcome email failed:', err.message))

    return res.json({ success: true, data: { tutor } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

export const rejectTutor = async (req, res) => {
  try {
    const tutor = await prisma.user.findUnique({
      where:  { id: req.params.id },
      select: { id: true, first_name: true, last_name: true, email: true },
    })
    await prisma.user.delete({ where: { id: req.params.id } })
    if (tutor) {
      await prisma.auditLog.create({
        data: {
          actor_id:    req.user.userId,
          action:      'tutor.rejected',
          entity_type: 'user',
          new_value:   { tutor_name: `${tutor.first_name} ${tutor.last_name}`, email: tutor.email },
        },
      }).catch(() => {})
    }
    return res.json({ success: true, message: 'Tutor account rejected and removed.' })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Database Schema ──────────────────────────────────────────
// GET /api/v1/admin/schema
export const getDatabaseSchema = async (req, res) => {
  try {
    const serialize = (d) =>
      JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))

    // Get table names first, then exact counts + metadata in parallel
    const rawTableNames = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

    const [exactCounts, rawCols, rawPKs, rawUniques, rawFKs] = await Promise.all([
      Promise.all(
        rawTableNames.map(t =>
          prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS cnt FROM "${t.table_name}"`)
            .then(r => ({ table_name: t.table_name, row_count: Number(r[0].cnt) }))
            .catch(() => ({ table_name: t.table_name, row_count: 0 }))
        )
      ),
      prisma.$queryRawUnsafe(`
        SELECT column_name, table_name, data_type, udt_name,
               character_maximum_length, is_nullable, column_default, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `),
      prisma.$queryRawUnsafe(`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
      `),
      prisma.$queryRawUnsafe(`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
      `),
      prisma.$queryRawUnsafe(`
        SELECT kcu.table_name AS from_table, kcu.column_name AS from_column,
               ccu.table_name AS to_table, ccu.column_name AS to_column,
               rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
          ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        ORDER BY kcu.table_name, kcu.column_name
      `),
    ])

    const tables  = exactCounts  // already plain objects, no BigInt
    const cols    = serialize(rawCols)
    const pks     = serialize(rawPKs)
    const uniques = serialize(rawUniques)
    const fks     = serialize(rawFKs)

    const pkSet     = new Set(pks.map(r    => `${r.table_name}.${r.column_name}`))
    const uniqueSet = new Set(uniques.map(r => `${r.table_name}.${r.column_name}`))
    const fkMap     = {}
    for (const r of fks) {
      fkMap[`${r.from_table}.${r.from_column}`] = {
        to_table: r.to_table, to_column: r.to_column, delete_rule: r.delete_rule,
      }
    }

    const enriched = tables.map(t => ({
      name:     t.table_name,
      rowCount: t.row_count,
      columns:  cols.filter(c => c.table_name === t.table_name).map(c => {
        const key  = `${t.table_name}.${c.column_name}`
        let   type = c.data_type
        if (c.data_type === 'USER-DEFINED') type = c.udt_name
        if (c.character_maximum_length)     type += `(${c.character_maximum_length})`
        return {
          name:     c.column_name,
          type,
          rawType:  c.data_type,
          udtName:  c.udt_name,
          nullable: c.is_nullable === 'YES',
          default:  c.column_default,
          isPK:     pkSet.has(key),
          isUnique: uniqueSet.has(key),
          isFk:     !!fkMap[key],
          fkRef:    fkMap[key] || null,
        }
      }),
    }))

    return res.json({
      success: true,
      data: {
        tables:      enriched,
        totalTables: enriched.length,
        totalCols:   enriched.reduce((s, t) => s + t.columns.length, 0),
        totalFKs:    fks.length,
      },
    })
  } catch (e) {
    console.error('getDatabaseSchema:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ============================================================
// CERTIFICATIONS
// ============================================================

// ─── List all certifications ──────────────────────────────────
// GET /api/v1/admin/certifications?status=&search=&page=
export const adminGetCertifications = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 30 } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const where = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { student: { first_name: { contains: search, mode: 'insensitive' } } },
        { student: { last_name:  { contains: search, mode: 'insensitive' } } },
        { student: { email:      { contains: search, mode: 'insensitive' } } },
        { module:  { name:       { contains: search, mode: 'insensitive' } } },
        { course:  { title:      { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [total, certs] = await Promise.all([
      prisma.certification.count({ where }),
      prisma.certification.findMany({
        where,
        skip,
        take:    Number(limit),
        orderBy: { created_at: 'desc' },
        include: {
          student:  { select: { id: true, first_name: true, last_name: true, email: true, avatar_url: true } },
          tutor:    { select: { id: true, first_name: true, last_name: true } },
          module:   { select: { id: true, name: true, slug: true } },
          course:   { select: { id: true, title: true, slug: true } },
          approver: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
    ])

    return res.json({ success: true, data: { certifications: certs, total, page: Number(page), limit: Number(limit) } })
  } catch (error) {
    console.error('adminGetCertifications error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Manually create a certification (admin) ─────────────────
// POST /api/v1/admin/certifications
export const adminCreateCertification = async (req, res) => {
  try {
    const { student_id, module_id, course_id, completion_date, admin_notes } = req.body

    if (!student_id || (!module_id && !course_id)) {
      return res.status(400).json({ success: false, error: 'student_id and module_id or course_id are required' })
    }

    const assignment = await prisma.studentTutorAssignment.findFirst({
      where:   { student_id, status: 'active' },
      orderBy: { start_date: 'desc' },
    }) ?? await prisma.studentTutorAssignment.findFirst({
      where:   { student_id },
      orderBy: { created_at: 'desc' },
    })

    if (!assignment) {
      return res.status(400).json({ success: false, error: 'No tutor assignment found for this student' })
    }

    const cert = await prisma.certification.create({
      data: {
        student_id,
        tutor_id:        assignment.tutor_id,
        module_id:       module_id  || null,
        course_id:       course_id  || null,
        status:          'pending',
        completion_date: new Date(completion_date || Date.now()),
        admin_notes:     admin_notes || null,
      },
    })

    return res.status(201).json({ success: true, data: { certification: cert } })
  } catch (error) {
    console.error('adminCreateCertification error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Admin issues (approves) a certification ─────────────────
// PATCH /api/v1/admin/certifications/:id/issue
export const adminIssueCertification = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { id }  = req.params
    const { admin_notes, pdf_url, issued_date } = req.body

    const cert = await prisma.certification.findUnique({ where: { id } })
    if (!cert) return res.status(404).json({ success: false, error: 'Certification not found' })
    if (cert.status === 'approved') {
      return res.status(400).json({ success: false, error: 'Already issued' })
    }

    const updated = await prisma.certification.update({
      where: { id },
      data: {
        status:      'approved',
        approved_by: adminId,
        issued_date: issued_date ? new Date(issued_date) : new Date(),
        admin_notes: admin_notes || cert.admin_notes,
        pdf_url:     pdf_url     || cert.pdf_url,
      },
      include: {
        student:  { select: { id: true, first_name: true, last_name: true, email: true } },
        tutor:    { select: { id: true, first_name: true, last_name: true } },
        module:   { select: { id: true, name: true } },
        course:   { select: { id: true, title: true } },
      },
    })

    return res.json({ success: true, data: { certification: updated } })
  } catch (error) {
    console.error('adminIssueCertification error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Admin rejects or revokes a certification ─────────────────
// PATCH /api/v1/admin/certifications/:id/reject
export const adminRejectCertification = async (req, res) => {
  try {
    const { id }   = req.params
    const { admin_notes, revoke } = req.body

    const cert = await prisma.certification.findUnique({ where: { id } })
    if (!cert) return res.status(404).json({ success: false, error: 'Certification not found' })

    const updated = await prisma.certification.update({
      where: { id },
      data:  { status: revoke ? 'revoked' : 'rejected', admin_notes: admin_notes || cert.admin_notes },
    })

    return res.json({ success: true, data: { certification: updated } })
  } catch (error) {
    console.error('adminRejectCertification error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Backfill cert requests for students who already qualify ──
// POST /api/v1/admin/certifications/backfill
export const adminBackfillCertifications = async (req, res) => {
  try {
    // Find all modules that have a cert threshold set
    const modules = await prisma.module.findMany({
      where:  { cert_sessions_required: { not: null } },
      select: { id: true, name: true, cert_sessions_required: true },
    })

    if (!modules.length) {
      return res.json({ success: true, data: { created: 0, message: 'No modules have a cert threshold set' } })
    }

    let created = 0

    for (const mod of modules) {
      // Count completed sessions per student for this module
      const completedByStudent = await prisma.session.groupBy({
        by:    ['student_id', 'tutor_id'],
        where: { module_id: mod.id, status: 'completed' },
        _count: { _all: true },
      })

      const eligible = completedByStudent.filter(r => r._count._all >= mod.cert_sessions_required)

      for (const row of eligible) {
        // Skip if a non-rejected cert already exists
        const existing = await prisma.certification.findFirst({
          where: {
            student_id: row.student_id,
            module_id:  mod.id,
            status:     { notIn: ['rejected', 'revoked'] },
          },
        })
        if (existing) continue

        // Find the most recent completed session to get tutor_id and completion date
        const lastSession = await prisma.session.findFirst({
          where:   { student_id: row.student_id, module_id: mod.id, status: 'completed' },
          orderBy: { scheduled_date: 'desc' },
        })

        await prisma.certification.create({
          data: {
            student_id:      row.student_id,
            tutor_id:        lastSession?.tutor_id || row.tutor_id,
            module_id:       mod.id,
            status:          'pending',
            completion_date: lastSession?.scheduled_date || new Date(),
          },
        })
        created++
      }
    }

    return res.json({ success: true, data: { created, message: `Created ${created} certification request${created !== 1 ? 's' : ''}` } })
  } catch (error) {
    console.error('adminBackfillCertifications error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}