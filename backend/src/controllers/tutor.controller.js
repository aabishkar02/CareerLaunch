import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ─── Get my assigned students ─────────────────────────────────
// GET /api/v1/tutors/me/students
export const getMyStudents = async (req, res) => {
  try {
    const tutorId = req.user.userId

    const assignments = await prisma.studentTutorAssignment.findMany({
      where:   { tutor_id: tutorId, status: 'active' },
      include: {
        student: {
          select: {
            id:         true,
            first_name: true,
            last_name:  true,
            email:      true,
            avatar_url: true,
            onboarded:  true,
            created_at: true,
          },
        },
      },
      orderBy: { start_date: 'desc' },
    })

    // For each student, get their enrollments + progress
    const enriched = await Promise.all(
      assignments.map(async (a) => {
        const enrollments = await prisma.enrollment.findMany({
          where:   { student_id: a.student_id, status: 'active' },
          include: {
            course: {
              select: { id: true, title: true, slug: true },
            },
          },
        })

        const progressSummary = await prisma.studentProgress.groupBy({
          by:     ['status'],
          where:  { student_id: a.student_id },
          _count: { status: true },
        })

        const total     = progressSummary.reduce((s, p) => s + p._count.status, 0)
        const completed = progressSummary.find(p => p.status === 'completed')?._count?.status || 0
        const percent   = total > 0 ? Math.round((completed / total) * 100) : 0

        return {
          assignment_id: a.id,
          start_date:    a.start_date,
          student:       a.student,
          enrollments,
          progress: { total, completed, percent },
        }
      })
    )

    return res.status(200).json({
      success: true,
      data:    { students: enriched, total: enriched.length },
    })
  } catch (error) {
    console.error('Get my students error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get tutor dashboard summary ──────────────────────────────
// GET /api/v1/tutors/me/dashboard
export const getTutorDashboard = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const today   = new Date()
    today.setHours(0, 0, 0, 0)

    const [studentCount, todaySessions, upcomingSessions, pendingSessions, hoursWorked] =
      await Promise.all([
        prisma.studentTutorAssignment.count({ where: { tutor_id: tutorId, status: 'active' } }),

        prisma.session.findMany({
          where: {
            tutor_id:       tutorId,
            scheduled_date: today,
            status:         { in: ['confirmed', 'pending'] },
          },
          include: {
            student: { select: { id: true, first_name: true, last_name: true, email: true } },
          },
          orderBy: { start_time: 'asc' },
        }),

        prisma.session.findMany({
          where: {
            tutor_id:       tutorId,
            scheduled_date: { gt: today },
            status:         { in: ['confirmed', 'pending'] },
          },
          take:    5,
          orderBy: { scheduled_date: 'asc' },
          include: {
            student: { select: { id: true, first_name: true, last_name: true } },
          },
        }),

        prisma.session.count({
          where: { tutor_id: tutorId, status: 'pending' },
        }),

        prisma.attendanceLog.aggregate({
          where:  { tutor_id: tutorId },
          _sum:   { hours_worked: true },
        }),
      ])

    return res.status(200).json({
      success: true,
      data: {
        student_count:     studentCount,
        today_sessions:    todaySessions,
        upcoming_sessions: upcomingSessions,
        pending_requests:  pendingSessions,
        total_hours:       hoursWorked._sum.hours_worked || 0,
      },
    })
  } catch (error) {
    console.error('Tutor dashboard error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get tutor calendar (availability + busy slots) ───────────
// GET /api/v1/tutors/me/calendar?month=2026-06
// GET /api/v1/tutors/:id/calendar?month=2026-06  (for admin/student)
export const getTutorCalendar = async (req, res) => {
  try {
    const tutorId = req.params.id || req.user.userId
    const { month } = req.query  // format: "2026-06"

    // Use pure UTC so the range is never off-by-one in any timezone
    let start, end
    if (month) {
      start = new Date(`${month}-01T00:00:00.000Z`)
      end   = new Date(start)
      end.setUTCMonth(end.getUTCMonth() + 1)   // first of next month (UTC)
    } else {
      const now = new Date()
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    }

    const [tutor, availability, busySlots, sessions] = await Promise.all([
      prisma.user.findUnique({ where: { id: tutorId }, select: { timezone: true } }),

      // Recurring weekly availability
      prisma.tutorAvailability.findMany({
        where: { tutor_id: tutorId },
        orderBy: { day_of_week: 'asc' },
      }),

      // Specific busy slots this month (lt end = exclusive upper bound)
      prisma.tutorBusySlot.findMany({
        where: {
          tutor_id: tutorId,
          date:     { gte: start, lt: end },
        },
        orderBy: { date: 'asc' },
      }),

      // Sessions booked this month
      prisma.session.findMany({
        where: {
          tutor_id:       tutorId,
          scheduled_date: { gte: start, lt: end },
          status:         { in: ['pending', 'confirmed', 'completed'] },
        },
        include: {
          student: { select: { id: true, first_name: true, last_name: true, username: true } },
          module:  { select: { name: true } },
        },
        orderBy: { scheduled_date: 'asc' },
      }),
    ])

    // Role-based response shaping: students see only time + busy status, no booking details
    const role = req.user?.role
    const sessionsResponse = role === 'student'
      ? sessions.map(s => ({
          scheduled_date: s.scheduled_date,
          start_time:     s.start_time,
          end_time:       s.end_time,
          status:         'busy',
        }))
      : sessions

    // Students must not see the reason or id of busy slots — only time range
    const busySlotsResponse = role === 'student'
      ? busySlots.map(b => ({
          date:       b.date,
          start_time: b.start_time,
          end_time:   b.end_time,
        }))
      : busySlots

    return res.status(200).json({
      success: true,
      data: {
        month:          month || `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
        tutor_timezone: tutor?.timezone || null,
        availability,
        busy_slots:     busySlotsResponse,
        sessions:       sessionsResponse,
      },
    })
  } catch (error) {
    console.error('Tutor calendar error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Mark tutor as busy ───────────────────────────────────────
// POST /api/v1/tutors/me/busy
export const markBusy = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { date, start_time, end_time, reason } = req.body

    if (!date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error:   'date, start_time and end_time are required',
      })
    }

    // Reject past time slots — compare against server UTC time
    const slotStart = new Date(`${date}T${start_time}:00.000Z`)
    if (slotStart <= new Date()) {
      return res.status(400).json({ success: false, error: 'You cannot modify a past time slot.' })
    }

    const slot = await prisma.tutorBusySlot.create({
      data: {
        tutor_id:   tutorId,
        date:       new Date(date),
        start_time,
        end_time,
        reason:     reason || null,
      },
    })

    return res.status(201).json({ success: true, data: { slot } })
  } catch (error) {
    console.error('Mark busy error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Remove busy slot ─────────────────────────────────────────
// DELETE /api/v1/tutors/me/busy/:id
export const removeBusySlot = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { id }  = req.params

    const slot = await prisma.tutorBusySlot.findUnique({ where: { id } })
    if (!slot || slot.tutor_id !== tutorId) {
      return res.status(404).json({ success: false, error: 'Slot not found' })
    }

    // Reject modification of past time slots — compare against server UTC time
    const slotStart = new Date(`${String(slot.date).slice(0, 10)}T${slot.start_time}:00.000Z`)
    if (slotStart <= new Date()) {
      return res.status(400).json({ success: false, error: 'You cannot modify a past time slot.' })
    }

    await prisma.tutorBusySlot.delete({ where: { id } })

    return res.status(200).json({ success: true, message: 'Busy slot removed' })
  } catch (error) {
    console.error('Remove busy slot error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my assigned courses ──────────────────────────────────
// GET /api/v1/tutors/me/courses
export const getMyCourses = async (req, res) => {
  try {
    const tutorId = req.user.userId

    const assignments = await prisma.courseTutor.findMany({
      where: { tutor_id: tutorId },
      include: {
        course: {
          include: {
            modules:       { where: { published: true }, orderBy: { order_index: 'asc' } },
            pricing_plans: { where: { active: true } },
            _count: { select: { enrollments: true, sessions: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    })

    const courses = assignments.map(a => ({
      ...a.course,
      enrolled_count: a.course._count?.enrollments || 0,
      session_count:  a.course._count?.sessions    || 0,
    }))

    return res.json({ success: true, data: { courses } })
  } catch (error) {
    console.error('Get my courses error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Post meeting link ────────────────────────────────────────
// POST /api/v1/tutors/me/meetings
// student_ids: optional array — if provided, only those students are notified/scheduled.
//              If omitted, falls back to all active enrollments for the course.
export const postMeetingLink = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { course_id, title, link, description, scheduled_at, recurring, student_ids } = req.body

    if (!course_id || !title || !link) {
      return res.status(400).json({
        success: false,
        error:   'course_id, title and link are required',
      })
    }

    // Reject scheduling meetings in the past
    if (scheduled_at && new Date(scheduled_at) <= new Date()) {
      return res.status(400).json({ success: false, error: 'You cannot schedule a meeting in the past.' })
    }

    // Verify tutor is assigned to this course
    const courseTutor = await prisma.courseTutor.findUnique({
      where: { course_id_tutor_id: { course_id, tutor_id: tutorId } },
    })
    if (!courseTutor) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this course' })
    }

    const meeting = await prisma.courseMeetingLink.create({
      data: {
        course_id,
        tutor_id:     tutorId,
        title,
        link,
        description:  description || null,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
        recurring:    recurring || false,
      },
    })

    // Determine which students to notify
    let targetIds = []
    if (student_ids && student_ids.length > 0) {
      // Only specified students
      targetIds = student_ids
    } else {
      // Fallback: all active enrollments
      const enrollments = await prisma.enrollment.findMany({
        where:  { course_id, status: 'active' },
        select: { student_id: true },
      })
      targetIds = enrollments.map(e => e.student_id)
    }

    if (targetIds.length > 0) {
      await prisma.notification.createMany({
        data: targetIds.map(sid => ({
          user_id: sid,
          title:   `New meeting link: ${title}`,
          message: `A meeting has been posted for your course. ${scheduled_at ? `Scheduled: ${new Date(scheduled_at).toLocaleString()}` : ''}`,
          type:    'info',
          sent_by: tutorId,
        })),
      })
    }

    // If scheduled_at provided, create confirmed sessions (meeting = session)
    if (scheduled_at && targetIds.length > 0) {
      const start = new Date(scheduled_at)
      const end   = new Date(start)
      end.setHours(end.getHours() + 1)
      const start_time = start.toTimeString().slice(0, 5)
      const end_time   = end.toTimeString().slice(0, 5)

      const sessionsData = targetIds.map(sid => ({
        student_id:       sid,
        tutor_id:         tutorId,
        course_id,
        subject:          title,
        notes:            description || null,
        scheduled_date:   start,
        start_time,
        end_time,
        duration_minutes: 60,
        status:           'confirmed',
        meeting_link:     link,
      }))

      await prisma.session.createMany({ data: sessionsData })
    }

    return res.status(201).json({ success: true, data: { meeting } })
  } catch (error) {
    console.error('Post meeting error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get meetings for a course ────────────────────────────────
// GET /api/v1/courses/:courseId/meetings
export const getCourseMeetings = async (req, res) => {
  try {
    const { courseId } = req.params

    const meetings = await prisma.courseMeetingLink.findMany({
      where:   { course_id: courseId },
      orderBy: { created_at: 'desc' },
      include: {
        tutor: { select: { id: true, first_name: true, last_name: true } },
      },
    })

    return res.status(200).json({ success: true, data: { meetings } })
  } catch (error) {
    console.error('Get meetings error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Delete meeting link ──────────────────────────────────────
// DELETE /api/v1/tutors/me/meetings/:id
export const deleteMeetingLink = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { id }  = req.params

    const meeting = await prisma.courseMeetingLink.findUnique({ where: { id } })
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' })
    }

    // Tutor can delete their own — admin can delete any
    if (meeting.tutor_id !== tutorId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized' })
    }

    await prisma.courseMeetingLink.delete({ where: { id } })

    return res.status(200).json({ success: true, message: 'Meeting link deleted' })
  } catch (error) {
    console.error('Delete meeting error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get student detail (for tutor) ──────────────────────────
// GET /api/v1/tutors/me/students/:studentId
export const getStudentDetail = async (req, res) => {
  try {
    const tutorId   = req.user.userId
    const { studentId } = req.params

    // Verify this student is assigned to this tutor
    const assignment = await prisma.studentTutorAssignment.findFirst({
      where: { tutor_id: tutorId, student_id: studentId, status: 'active' },
    })
    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Student not assigned to you' })
    }

    const [student, enrollments, progress, sessions, moduleEnrollments] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: studentId },
        select: {
          id:                  true,
          first_name:          true,
          last_name:           true,
          email:               true,
          avatar_url:          true,
          bio:                 true,
          timezone:            true,
          onboarded:           true,
          created_at:          true,
          onboarding_response: true,
        },
      }),

      prisma.enrollment.findMany({
        where:   { student_id: studentId, status: 'active' },
        include: {
          course: {
            include: {
              modules:       { orderBy: { order_index: 'asc' } },
              meeting_links: { orderBy: { created_at: 'desc' }, take: 3 },
            },
          },
        },
      }),

      prisma.studentProgress.findMany({
        where:   { student_id: studentId },
        include: { module: true },
        orderBy: { module: { order_index: 'asc' } },
      }),

      prisma.session.findMany({
        where:   { student_id: studentId, tutor_id: tutorId },
        orderBy: { scheduled_date: 'desc' },
        take:    10,
      }),

      prisma.moduleEnrollment.findMany({
        where:   { student_id: studentId, status: 'active' },
        include: { module: { select: { id: true, name: true, cert_sessions_required: true } } },
      }),
    ])

    // Per-module completed session counts
    const completedByModule = await prisma.session.groupBy({
      by:    ['module_id'],
      where: { student_id: studentId, status: 'completed', module_id: { not: null } },
      _count: { _all: true },
    })
    const completedMap = Object.fromEntries(completedByModule.map(r => [r.module_id, r._count._all]))

    const moduleSessions = moduleEnrollments.map(me => ({
      module_id:              me.module_id,
      module_name:            me.module?.name || '',
      cert_sessions_required: me.module?.cert_sessions_required ?? null,
      completed_sessions:     completedMap[me.module_id] ?? 0,
    }))

    return res.status(200).json({
      success: true,
      data:    { student, enrollments, progress, sessions, module_sessions: moduleSessions },
    })
  } catch (error) {
    console.error('Get student detail error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Clock in ────────────────────────────────────────────────
// POST /api/v1/tutors/me/clock-in
export const clockIn = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { session_id, location, notes } = req.body

    // Check not already clocked in
    const existing = await prisma.attendanceLog.findFirst({
      where: { tutor_id: tutorId, clock_out: null },
    })
    if (existing) {
      return res.status(409).json({
        success: false,
        error:   'You are already clocked in. Clock out first.',
        data:    { attendance_id: existing.id },
      })
    }

    const log = await prisma.attendanceLog.create({
      data: {
        tutor_id:   tutorId,
        session_id: session_id || null,
        clock_in:   new Date(),
        location:   location || null,
        notes:      notes || null,
      },
    })

    return res.status(201).json({ success: true, data: { attendance: log } })
  } catch (error) {
    console.error('Clock in error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Clock out ────────────────────────────────────────────────
// POST /api/v1/tutors/me/clock-out
export const clockOut = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { attendance_id, notes } = req.body

    const log = await prisma.attendanceLog.findFirst({
      where: { tutor_id: tutorId, clock_out: null },
    })
    if (!log) {
      return res.status(404).json({ success: false, error: 'No active clock-in found' })
    }

    const clockOut = new Date()
    const hoursWorked = Math.round(
      ((clockOut - log.clock_in) / 3600000) * 100
    ) / 100

    const updated = await prisma.attendanceLog.update({
      where: { id: attendance_id || log.id },
      data: {
        clock_out:    clockOut,
        hours_worked: hoursWorked,
        notes:        notes || log.notes,
      },
    })

    return res.status(200).json({
      success: true,
      data:    { attendance: updated },
    })
  } catch (error) {
    console.error('Clock out error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my availability slots ───────────────────────────────
// GET /api/v1/tutors/me/availability
export const getMyAvailability = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const slots = await prisma.tutorAvailability.findMany({
      where:   { tutor_id: tutorId },
      orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
    })
    return res.status(200).json({ success: true, data: { slots } })
  } catch (error) {
    console.error('Get availability error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Add availability slot ───────────────────────────────────
// POST /api/v1/tutors/me/availability
// Deduplicates exact matches; merges overlapping / adjacent slots.
export const addAvailability = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { day_of_week, start_time, end_time, recurring, effective_from, effective_until } = req.body

    if (!day_of_week || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error:   'day_of_week, start_time and end_time are required',
      })
    }
    if (start_time >= end_time) {
      return res.status(400).json({ success: false, error: 'end_time must be after start_time' })
    }

    // Find all existing slots on the same day that overlap OR are adjacent.
    // Using lte/gte so touching slots (end == start) are also caught and merged.
    const overlapping = await prisma.tutorAvailability.findMany({
      where: {
        tutor_id:   tutorId,
        day_of_week,
        start_time: { lte: end_time },
        end_time:   { gte: start_time },
      },
    })

    // Exact duplicate — return the existing slot silently (idempotent)
    if (
      overlapping.length === 1 &&
      overlapping[0].start_time === start_time &&
      overlapping[0].end_time   === end_time
    ) {
      return res.status(200).json({ success: true, data: { slot: overlapping[0], duplicate: true } })
    }

    // Compute the union span across all overlapping slots + the new range
    const mergedStart = [start_time, ...overlapping.map(s => s.start_time)].sort()[0]
    const mergedEnd   = [end_time,   ...overlapping.map(s => s.end_time)].sort().at(-1)

    // Delete overlapping / absorbed slots
    if (overlapping.length > 0) {
      await prisma.tutorAvailability.deleteMany({
        where: { id: { in: overlapping.map(s => s.id) } },
      })
    }

    // Create the single merged (or brand-new) slot
    const slot = await prisma.tutorAvailability.create({
      data: {
        tutor_id:        tutorId,
        day_of_week,
        start_time:      mergedStart,
        end_time:        mergedEnd,
        recurring:       recurring !== false,
        effective_from:  effective_from  ? new Date(effective_from)  : null,
        effective_until: effective_until ? new Date(effective_until) : null,
      },
    })

    return res.status(201).json({
      success: true,
      data: {
        slot,
        merged:       overlapping.length > 0,
        merged_count: overlapping.length,
      },
    })
  } catch (error) {
    console.error('Add availability error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Remove availability slot ─────────────────────────────────
// DELETE /api/v1/tutors/me/availability/:id
export const removeAvailability = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { id }  = req.params

    const slot = await prisma.tutorAvailability.findUnique({ where: { id } })
    if (!slot || slot.tutor_id !== tutorId) {
      return res.status(404).json({ success: false, error: 'Slot not found' })
    }

    await prisma.tutorAvailability.delete({ where: { id } })
    return res.status(200).json({ success: true, message: 'Availability slot removed' })
  } catch (error) {
    console.error('Remove availability error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my hours ─────────────────────────────────────────────
// GET /api/v1/tutors/me/hours?range=month
export const getMyHours = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { range } = req.query

    let where = { tutor_id: tutorId, clock_out: { not: null } }

    if (range === 'month') {
      const start = new Date()
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      where.clock_in = { gte: start }
    } else if (range === 'week') {
      const start = new Date()
      start.setDate(start.getDate() - start.getDay())
      start.setHours(0, 0, 0, 0)
      where.clock_in = { gte: start }
    }

    const logs = await prisma.attendanceLog.findMany({
      where,
      orderBy: { clock_in: 'desc' },
    })

    const total = logs.reduce((s, l) => s + (Number(l.hours_worked) || 0), 0)

    return res.status(200).json({
      success: true,
      data:    { logs, total_hours: Math.round(total * 100) / 100 },
    })
  } catch (error) {
    console.error('Get hours error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get tutor earnings (session-based pay) ───────────────────
// GET /api/v1/tutors/me/earnings
export const getMyEarnings = async (req, res) => {
  try {
    const tutorId = req.user.userId

    const sessions = await prisma.session.findMany({
      where:   { tutor_id: tutorId, status: 'completed' },
      orderBy: { scheduled_date: 'desc' },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        course:  { select: { id: true, title: true } },
        module:  { select: { id: true, name: true } },
      },
    })

    const formatted = sessions.map(s => {
      const weekStart = new Date(s.scheduled_date)
      // Set to Monday of that week
      const day = weekStart.getDay()
      const diff = day === 0 ? -6 : 1 - day
      weekStart.setDate(weekStart.getDate() + diff)
      return {
        id:                s.id,
        subject:           s.subject,
        topic:             s.subject,
        scheduled_date:    s.scheduled_date,
        student_first_name: s.student.first_name,
        student_last_name:  s.student.last_name,
        module_name:       s.module?.title || s.course?.title || '',
        amount:            s.tutor_pay_cents ? s.tutor_pay_cents / 100 : 0,
        tutor_fee:         s.tutor_pay_cents ? s.tutor_pay_cents / 100 : 0,
        paid:              s.tutor_paid,
        paid_at:           s.tutor_paid_at,
        week_start:        weekStart.toISOString().slice(0, 10),
      }
    })

    return res.json({ success: true, data: { sessions: formatted } })
  } catch (e) {
    console.error('getMyEarnings error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get cert approvals pending for this tutor ────────────────
// GET /api/v1/tutors/me/cert-approvals
export const getPendingCertApprovals = async (req, res) => {
  try {
    const tutorId = req.user.userId

    const certs = await prisma.certification.findMany({
      where: { tutor_id: tutorId, status: { in: ['pending', 'tutor_approved', 'rejected'] } },
      orderBy: { created_at: 'desc' },
      include: {
        student: { select: { id: true, first_name: true, last_name: true, email: true, avatar_url: true } },
        module:  { select: { id: true, name: true, slug: true } },
        course:  { select: { id: true, title: true, slug: true } },
      },
    })

    return res.status(200).json({ success: true, data: { certifications: certs } })
  } catch (error) {
    console.error('getPendingCertApprovals error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Tutor approves a certification ──────────────────────────
// PATCH /api/v1/tutors/me/certifications/:id/approve
export const tutorApproveCertification = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { id }  = req.params
    const { tutor_notes } = req.body

    const cert = await prisma.certification.findUnique({ where: { id } })
    if (!cert || cert.tutor_id !== tutorId) {
      return res.status(404).json({ success: false, error: 'Certification not found' })
    }
    if (cert.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only pending certifications can be approved' })
    }

    const updated = await prisma.certification.update({
      where: { id },
      data: {
        tutor_approved:    true,
        tutor_approved_at: new Date(),
        tutor_notes:       tutor_notes || cert.tutor_notes,
        status:            'tutor_approved',
      },
    })

    return res.status(200).json({ success: true, data: { certification: updated } })
  } catch (error) {
    console.error('tutorApproveCertification error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Tutor rejects a certification ───────────────────────────
// PATCH /api/v1/tutors/me/certifications/:id/reject
export const tutorRejectCertification = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { id }  = req.params
    const { tutor_notes } = req.body

    const cert = await prisma.certification.findUnique({ where: { id } })
    if (!cert || cert.tutor_id !== tutorId) {
      return res.status(404).json({ success: false, error: 'Certification not found' })
    }
    if (!['pending', 'tutor_approved'].includes(cert.status)) {
      return res.status(400).json({ success: false, error: 'Certification cannot be rejected in its current state' })
    }

    const updated = await prisma.certification.update({
      where: { id },
      data: {
        status:      'rejected',
        tutor_notes: tutor_notes || cert.tutor_notes,
      },
    })

    return res.status(200).json({ success: true, data: { certification: updated } })
  } catch (error) {
    console.error('tutorRejectCertification error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}