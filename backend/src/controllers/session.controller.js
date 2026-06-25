import { prisma } from '../config/db.js'
import { emitToRoom } from '../config/socket.js'
import { localToDate, dateStrInTz } from '../utils/dateHelper.js'
import { safeError } from '../utils/prodError.js'

// ─── Student requests a session ───────────────────────────────
// POST /api/v1/sessions/request
// Protected — student only
export const requestSession = async (req, res) => {
  try {
    const studentId = req.user.userId
    const { tutor_id, slot_id, course_id, enrollment_id, module_id, subject, notes, scheduled_date, start_time, end_time } = req.body

    if (!tutor_id || !subject || !scheduled_date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: 'tutor_id, subject, scheduled_date, start_time and end_time are required',
      })
    }

    // Reject bookings in the past. Session times are stored in the tutor's
    // timezone, so interpret the slot in that tz before comparing against now.
    const tutor = await prisma.user.findUnique({ where: { id: tutor_id }, select: { timezone: true } })
    const sessionStart = localToDate(scheduled_date, start_time, tutor?.timezone)
    if (sessionStart <= new Date()) {
      return res.status(400).json({ success: false, error: 'You cannot book a session in the past.' })
    }

    // If module_id provided: validate student is enrolled in the module and tutor is assigned to it
    if (module_id) {
      const moduleEnrollment = await prisma.moduleEnrollment.findFirst({
        where: { student_id: studentId, module_id, status: 'active' },
      })
      if (!moduleEnrollment) {
        return res.status(403).json({ success: false, error: 'You are not enrolled in this module' })
      }

      const moduleTutor = await prisma.moduleTutor.findUnique({
        where: { module_id_tutor_id: { module_id, tutor_id } },
      })
      if (!moduleTutor) {
        // Accept tutors directly assigned to the student's module enrollment
        const directAssignment = await prisma.moduleEnrollment.findFirst({
          where: { student_id: studentId, module_id, tutor_id, status: 'active' },
        })
        if (!directAssignment) {
          // Fall back to course-level tutor assignment (mirrors getEnrollmentTutors fallback)
          const courseTutor = await prisma.courseTutor.findUnique({
            where: { course_id_tutor_id: { course_id: moduleEnrollment.course_id, tutor_id } },
          })
          if (!courseTutor) {
            return res.status(403).json({ success: false, error: 'This tutor is not assigned to this module' })
          }
        }
      }

      // Credit availability is enforced atomically at session creation below:
      // booking holds 1 credit (credits_used + 1), released if cancelled.
    } else if (course_id) {
      // Course-level check (legacy)
      const enrollment = enrollment_id
        ? await prisma.enrollment.findFirst({ where: { id: enrollment_id, student_id: studentId, course_id, status: 'active' } })
        : await prisma.enrollment.findFirst({ where: { student_id: studentId, course_id, status: 'active' } })

      if (!enrollment) {
        return res.status(403).json({ success: false, error: 'You are not enrolled in this course' })
      }

      const courseTutor = await prisma.courseTutor.findUnique({
        where: { course_id_tutor_id: { course_id, tutor_id } },
      })
      if (!courseTutor) {
        return res.status(403).json({ success: false, error: 'This tutor is not assigned to this course' })
      }
    } else {
      // Fallback: any active tutor assignment
      const assignment = await prisma.studentTutorAssignment.findFirst({
        where: { student_id: studentId, tutor_id, status: 'active' },
      })
      if (!assignment) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this tutor' })
      }
    }

    // Check tutor is not busy at this time (any overlap)
    const busy = await prisma.tutorBusySlot.findFirst({
      where: {
        tutor_id,
        date:       new Date(scheduled_date),
        start_time: { lt: end_time },
        end_time:   { gt: start_time },
      },
    })
    if (busy) {
      return res.status(409).json({
        success: false,
        error: 'Tutor is marked as busy at this time',
      })
    }

    // Check slot not already booked. Two ranges overlap iff each starts before
    // the other ends — this also catches a new slot fully containing an existing
    // one (or vice versa), which the previous boundary-only check missed.
    const conflict = await prisma.session.findFirst({
      where: {
        tutor_id,
        scheduled_date: new Date(scheduled_date),
        status:         { in: ['pending', 'confirmed'] },
        start_time:     { lt: end_time },
        end_time:       { gt: start_time },
      },
    })
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: 'This time slot is already booked',
      })
    }

    // Calculate duration
    const [sh, sm] = start_time.split(':').map(Number)
    const [eh, em] = end_time.split(':').map(Number)
    const duration_minutes = (eh * 60 + em) - (sh * 60 + sm)

    // enrollment_id from module-based bookings is a ModuleEnrollment ID — don't use it here
    const resolvedEnrollmentId = module_id
      ? null
      : enrollment_id || (course_id
        ? (await prisma.enrollment.findFirst({ where: { student_id: studentId, course_id, status: 'active' } }))?.id
        : null)

    // Hold 1 credit at booking time for module sessions. The hold and the insert
    // share a transaction so a failed insert can't leak a held credit, and the
    // conditional update (used < granted) can't oversell under concurrent bookings.
    let session
    try {
      session = await prisma.$transaction(async (tx) => {
        if (module_id) {
          const hold = await tx.moduleCredit.updateMany({
            where: {
              student_id:   studentId,
              module_id,
              credits_used: { lt: prisma.moduleCredit.fields.credits_granted },
            },
            data: { credits_used: { increment: 1 } },
          })
          if (hold.count === 0) {
            const err = new Error('NO_CREDITS')
            err.code = 'NO_CREDITS'
            throw err
          }
        }

        return tx.session.create({
          data: {
            student_id:      studentId,
            tutor_id,
            course_id:       course_id       || null,
            enrollment_id:   resolvedEnrollmentId || null,
            module_id:       module_id       || null,
            slot_id:         slot_id         || null,
            subject,
            notes:           notes           || null,
            scheduled_date:  new Date(scheduled_date),
            start_time,
            end_time,
            duration_minutes,
            status:          'pending',
          },
          include: {
            tutor:   { select: { id: true, first_name: true, last_name: true, email: true } },
            student: { select: { id: true, first_name: true, last_name: true, email: true } },
          },
        })
      })
    } catch (err) {
      if (err.code === 'NO_CREDITS') {
        return res.status(402).json({
          success: false,
          error: 'You have no session credits remaining for this module. Purchase more credits to book another session.',
          noCredits: true,
        })
      }
      throw err
    }

    // Push real-time update to both parties
    emitToRoom(tutor_id, 'session:new', { session })
    emitToRoom(studentId, 'session:new', { session })

    // Notify tutor of the new booking
    await prisma.notification.create({
      data: {
        user_id: tutor_id,
        title:   'New session booked',
        message: `${session.student.first_name} ${session.student.last_name} booked a session on ${scheduled_date} at ${start_time}. Add a meeting link from your calendar.`,
        type:    'info',
        sent_by: studentId,
      },
    })

    // Notify student that booking is received and pending tutor confirmation
    await prisma.notification.create({
      data: {
        user_id: studentId,
        title:   'Session requested',
        message: `Your session request on ${scheduled_date} at ${start_time} with ${session.tutor.first_name} ${session.tutor.last_name} has been sent. You'll be notified once they confirm.${module_id ? ' 1 session credit has been held for this booking — it will be released if the session is cancelled.' : ''}`,
        type:    'info',
        sent_by: tutor_id,
      },
    })

    return res.status(201).json({ success: true, data: { session } })
  } catch (error) {
    console.error('Request session error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Tutor confirms a session ─────────────────────────────────
// PATCH /api/v1/sessions/:id/confirm
// Protected — tutor only
export const confirmSession = async (req, res) => {
  try {
    const tutorId   = req.user.userId
    const { id }    = req.params
    const { meeting_link } = req.body

    const session = await prisma.session.findUnique({ where: { id } })
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    if (session.tutor_id !== tutorId) return res.status(403).json({ success: false, error: 'Not authorized' })
    if (session.status === 'cancelled' || session.status === 'completed') {
      return res.status(400).json({ success: false, error: `Cannot update a ${session.status} session` })
    }

    const isConfirming = session.status === 'pending'

    const updated = await prisma.session.update({
      where: { id },
      data: {
        status:       'confirmed',
        meeting_link: meeting_link !== undefined ? (meeting_link || null) : session.meeting_link,
      },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true } },
      },
    })

    // Push real-time update to both parties
    emitToRoom(session.student_id, 'session:updated', { session: updated })
    emitToRoom(tutorId, 'session:updated', { session: updated })

    // Notify student on first confirmation or when a meeting link is added/changed
    if (isConfirming || meeting_link) {
      await prisma.notification.create({
        data: {
          user_id: session.student_id,
          title:   isConfirming ? 'Session confirmed' : 'Meeting link updated',
          message: isConfirming
            ? `Your session on ${session.scheduled_date} at ${session.start_time} has been confirmed.${meeting_link ? ` Join here: ${meeting_link}` : ''}`
            : `Meeting link updated for your session on ${session.scheduled_date} at ${session.start_time}. Join here: ${meeting_link}`,
          type:    'info',
          sent_by: tutorId,
        },
      })
    }

    return res.status(200).json({ success: true, data: { session: updated } })
  } catch (error) {
    console.error('Confirm session error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Tutor updates meeting link / notes on upcoming session ───
// PATCH /api/v1/sessions/:id/link
// Protected — tutor only; session must be pending or confirmed
export const updateSessionLink = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { id }  = req.params
    const { meeting_link, tutor_notes } = req.body

    const session = await prisma.session.findUnique({ where: { id } })
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    if (session.tutor_id !== tutorId) return res.status(403).json({ success: false, error: 'Not authorized' })
    if (session.status === 'cancelled' || session.status === 'completed') {
      return res.status(400).json({ success: false, error: `Cannot edit a ${session.status} session` })
    }

    const linkChanged = meeting_link !== undefined && meeting_link !== session.meeting_link

    const updated = await prisma.session.update({
      where: { id },
      data: {
        ...(meeting_link !== undefined && { meeting_link: meeting_link || null }),
        ...(tutor_notes  !== undefined && { tutor_notes:  tutor_notes  || null }),
      },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true } },
      },
    })

    emitToRoom(session.student_id, 'session:updated', { session: updated })
    emitToRoom(tutorId, 'session:updated', { session: updated })

    if (linkChanged && meeting_link) {
      await prisma.notification.create({
        data: {
          user_id: session.student_id,
          title:   'Meeting link updated',
          message: `Meeting link updated for your session on ${session.scheduled_date} at ${session.start_time}. Join here: ${meeting_link}`,
          type:    'info',
          sent_by: tutorId,
        },
      })
    }

    return res.status(200).json({ success: true, data: { session: updated } })
  } catch (error) {
    console.error('Update session link error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Cancel a session ─────────────────────────────────────────
// PATCH /api/v1/sessions/:id/cancel
// Protected — student, tutor, or admin
// Admin requires { admin_email } in body for confirmation
export const cancelSession = async (req, res) => {
  try {
    const userId = req.user.userId
    const role   = req.user.role
    const { id } = req.params
    const { reason, admin_email } = req.body

    const session = await prisma.session.findUnique({
      where:   { id },
      include: {
        student: { select: { id: true, first_name: true, last_name: true, email: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true, timezone: true } },
      },
    })

    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const isParticipant = session.student_id === userId || session.tutor_id === userId || role === 'admin'
    if (!isParticipant) return res.status(403).json({ success: false, error: 'Not authorized' })

    if (session.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Session is already cancelled' })
    }

    // Students may only self-cancel if session is more than 24 hours away.
    // Times are stored in the tutor's timezone — interpret them correctly before
    // comparing against now, otherwise the check is wrong for non-UTC tutors.
    if (role === 'student') {
      const dateStr = session.scheduled_date.toISOString().substring(0, 10)
      const sessionDatetime = localToDate(dateStr, session.start_time, session.tutor?.timezone)
      const hoursUntil = (sessionDatetime - new Date()) / (1000 * 60 * 60)
      if (hoursUntil < 24) {
        return res.status(400).json({
          success: false,
          error: 'Session is within 24 hours. Please use "Request Cancellation" and an admin will review it.',
          within24h: true,
        })
      }
    }

    // Admin must confirm with their email before cancelling
    if (role === 'admin') {
      if (!admin_email) {
        return res.status(400).json({ success: false, error: 'Admin email confirmation is required.' })
      }
      const adminUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
      if (admin_email.toLowerCase().trim() !== adminUser.email.toLowerCase().trim()) {
        return res.status(400).json({ success: false, error: 'Email does not match your admin account. Please try again.' })
      }
    }

    const updated = await prisma.session.update({
      where: { id },
      data: {
        status:           'cancelled',
        cancelled_by:     userId,
        cancel_reason:    reason || null,
        cancel_requested: false,
      },
    })

    // Release the credit held at booking. Only pending/confirmed sessions hold
    // one — completed sessions have consumed it (use undo-complete to reverse).
    let creditReleased = false
    if (session.module_id && ['pending', 'confirmed'].includes(session.status)) {
      const released = await prisma.moduleCredit.updateMany({
        where: { student_id: session.student_id, module_id: session.module_id, credits_used: { gt: 0 } },
        data:  { credits_used: { decrement: 1 } },
      })
      creditReleased = released.count > 0
    }

    // Push real-time update to both parties
    emitToRoom(session.student_id, 'session:updated', { session: updated })
    emitToRoom(session.tutor_id, 'session:updated', { session: updated })

    // Notify both student and tutor
    const cancellerName = role === 'admin'
      ? 'Admin'
      : session.student_id === userId
        ? `${session.student.first_name} ${session.student.last_name}`
        : `${session.tutor.first_name} ${session.tutor.last_name}`

    const notifyIds = role === 'admin'
      ? [session.student_id, session.tutor_id]
      : [session.student_id === userId ? session.tutor_id : session.student_id]

    await prisma.notification.createMany({
      data: notifyIds.map(uid => ({
        user_id: uid,
        title:   'Session cancelled',
        message: `Your session on ${session.scheduled_date.toISOString().substring(0, 10)} at ${session.start_time} was cancelled by ${cancellerName}.${reason ? ` Reason: ${reason}` : ''}${uid === session.student_id && creditReleased ? ' Your session credit has been released back to your balance.' : ''}`,
        type:    'warning',
        sent_by: userId,
      })),
    })

    // The student cancelling their own session isn't in notifyIds — still tell
    // them their credit came back.
    if (creditReleased && userId === session.student_id) {
      await prisma.notification.create({
        data: {
          user_id: session.student_id,
          title:   'Credit released',
          message: `Your session credit for the cancelled session on ${session.scheduled_date.toISOString().substring(0, 10)} has been released back to your balance.`,
          type:    'info',
          sent_by: userId,
        },
      })
    }

    // Admin cancellations are logged to the audit logbook
    if (role === 'admin') {
      await prisma.auditLog.create({
        data: {
          actor_id:       userId,
          target_user_id: session.student_id,
          action:         'session.cancelled',
          entity_type:    'session',
          entity_id:      id,
          old_value:      { status: session.status },
          new_value: {
            status:         'cancelled',
            reason:         reason || null,
            student_name:   `${session.student.first_name} ${session.student.last_name}`,
            student_email:  session.student.email,
            tutor_name:     `${session.tutor.first_name} ${session.tutor.last_name}`,
            scheduled_date: session.scheduled_date.toISOString().substring(0, 10),
            start_time:     session.start_time,
            end_time:       session.end_time,
            confirmed_by:   admin_email,
          },
        },
      })
    }

    return res.status(200).json({ success: true, data: { session: updated } })
  } catch (error) {
    console.error('Cancel session error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Student requests cancellation (within 24h) ───────────────
// POST /api/v1/sessions/:id/cancel-request
// Protected — student only
export const requestCancellation = async (req, res) => {
  try {
    const studentId = req.user.userId
    const { id }    = req.params
    const { reason } = req.body

    const session = await prisma.session.findUnique({
      where:   { id },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true } },
      },
    })

    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    if (session.student_id !== studentId) return res.status(403).json({ success: false, error: 'Not authorized' })
    if (!['pending', 'confirmed'].includes(session.status)) {
      return res.status(400).json({ success: false, error: 'Session cannot be cancelled in its current state.' })
    }
    if (session.cancel_requested) {
      return res.status(400).json({ success: false, error: 'Cancellation already requested.' })
    }

    const updated = await prisma.session.update({
      where: { id },
      data: {
        cancel_requested:      true,
        cancel_request_reason: reason || null,
      },
    })

    // Notify all admins
    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } })
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map(a => ({
          user_id: a.id,
          title:   'Cancellation request',
          message: `${session.student.first_name} ${session.student.last_name} has requested cancellation of their session on ${session.scheduled_date.toISOString().substring(0, 10)} at ${session.start_time} with ${session.tutor.first_name} ${session.tutor.last_name}.${reason ? ` Reason: ${reason}` : ''}`,
          type:    'warning',
          sent_by: studentId,
        })),
      })
    }

    return res.status(200).json({ success: true, data: { session: updated } })
  } catch (error) {
    console.error('Request cancellation error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Complete a session ───────────────────────────────────────
// PATCH /api/v1/sessions/:id/complete
// Protected — tutor only
export const completeSession = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { id }  = req.params

    const session = await prisma.session.findUnique({ where: { id } })
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    if (session.tutor_id !== tutorId) return res.status(403).json({ success: false, error: 'Not authorized' })
    if (session.status !== 'confirmed') return res.status(400).json({ success: false, error: 'Only confirmed sessions can be completed' })

    // Block early completion — session date must be today or in the past, judged
    // in the tutor's local timezone (the calendar the session was scheduled on).
    const tutorRec = await prisma.user.findUnique({ where: { id: tutorId }, select: { timezone: true } })
    const todayLocal   = dateStrInTz(Date.now(), tutorRec?.timezone || 'UTC')
    const sessionDateStr = session.scheduled_date.toISOString().slice(0, 10)
    if (sessionDateStr > todayLocal) {
      return res.status(400).json({ success: false, error: 'You can only mark a session as done on or after the scheduled date' })
    }

    // The credit was already held at booking time — completion makes the hold
    // final. Just read the balance for the student's notification.
    let creditsRemaining = null
    if (session.module_id) {
      const credit = await prisma.moduleCredit.findUnique({
        where: { student_id_module_id: { student_id: session.student_id, module_id: session.module_id } },
      })
      creditsRemaining = (credit?.credits_granted ?? 0) - (credit?.credits_used ?? 0)
    }

    const { notes } = req.body || {}

    const updated = await prisma.session.update({
      where: { id },
      data:  { status: 'completed', tutor_notes: notes || null, completed_at: new Date() },
    })

    // Auto-log attendance from session times
    try {
      const sessionDate = new Date(session.scheduled_date)
      const [sh, sm] = session.start_time.split(':').map(Number)
      const [eh, em] = session.end_time.split(':').map(Number)

      const clockIn  = new Date(sessionDate)
      clockIn.setUTCHours(sh, sm, 0, 0)

      const clockOut = new Date(sessionDate)
      clockOut.setUTCHours(eh, em, 0, 0)
      if (clockOut <= clockIn) clockOut.setDate(clockOut.getDate() + 1) // handle midnight crossover

      const hoursWorked = Math.round((session.duration_minutes / 60) * 100) / 100

      // Use upsert in case the tutor already clocked in manually for this session
      await prisma.attendanceLog.upsert({
        where:  { session_id: id },
        update: { clock_out: clockOut, hours_worked: hoursWorked },
        create: {
          tutor_id:     tutorId,
          session_id:   id,
          clock_in:     clockIn,
          clock_out:    clockOut,
          hours_worked: hoursWorked,
          location:     'remote',
          notes:        notes || null,
        },
      })
    } catch (logErr) {
      // Non-fatal — don't block session completion if attendance log fails
      console.error('Auto-attendance log failed:', logErr)
    }

    // Push real-time update to both parties
    emitToRoom(session.student_id, 'session:updated', { session: updated })
    emitToRoom(tutorId, 'session:updated', { session: updated })

    if (session.module_id && creditsRemaining !== null) {
      await prisma.notification.create({
        data: {
          user_id: session.student_id,
          title:   'Session completed',
          message: `Your session has been marked complete. ${creditsRemaining} credit${creditsRemaining !== 1 ? 's' : ''} remaining for this module.`,
          type:    'info',
          sent_by: tutorId,
        },
      })
    }

    // Auto-create cert request when student hits the module's required session count
    if (session.module_id) {
      try {
        const module = await prisma.module.findUnique({
          where:  { id: session.module_id },
          select: { cert_sessions_required: true, name: true },
        })

        if (module?.cert_sessions_required) {
          const completedCount = await prisma.session.count({
            where: {
              student_id: session.student_id,
              module_id:  session.module_id,
              status:     'completed',
            },
          })

          if (completedCount >= module.cert_sessions_required) {
            const existingCert = await prisma.certification.findFirst({
              where: {
                student_id: session.student_id,
                module_id:  session.module_id,
                status:     { notIn: ['rejected', 'revoked'] },
              },
            })

            if (!existingCert) {
              const cert = await prisma.certification.create({
                data: {
                  student_id:      session.student_id,
                  tutor_id:        session.tutor_id,
                  module_id:       session.module_id,
                  status:          'pending',
                  completion_date: new Date(),
                },
              })

              await prisma.notification.create({
                data: {
                  user_id: session.student_id,
                  title:   'Certification request created',
                  message: `You've completed ${completedCount} sessions in ${module.name}. A certification request has been submitted for admin review.`,
                  type:    'info',
                  sent_by: tutorId,
                },
              })
            }
          }
        }
      } catch (certErr) {
        console.error('Auto-cert creation failed:', certErr)
      }
    }

    return res.status(200).json({ success: true, data: { session: updated, credits_remaining: creditsRemaining } })
  } catch (error) {
    console.error('Complete session error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get all sessions for logged in user ──────────────────────
// GET /api/v1/sessions/my
// Protected — any role
export const getMySessions = async (req, res) => {
  try {
    const userId = req.user.userId
    const role   = req.user.role
    const { status } = req.query

    const where = {
      ...(role === 'student' ? { student_id: userId } : {}),
      ...(role === 'tutor'   ? { tutor_id:   userId } : {}),
      ...(status ? { status } : {}),
    }

    const sessions = await prisma.session.findMany({
      where,
      orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }],
      include: {
        student: { select: { id: true, first_name: true, last_name: true, email: true, username: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true, email: true, timezone: true, username: true } },
        module:  { select: { id: true, name: true, display_order: true } },
        course:  { select: { id: true, title: true } },
        review:  { select: { id: true, rating: true } },
      },
    })

    // Flatten nested fields so frontend can access both styles
    const flat = sessions.map(s => ({
      ...s,
      // Flat aliases for student info
      student_first_name: s.student?.first_name || '',
      student_last_name:  s.student?.last_name  || '',
      student_name:       `${s.student?.first_name || ''} ${s.student?.last_name || ''}`.trim(),
      student_username:   s.student?.username || null,
      // Flat aliases for tutor info
      tutor_first_name:   s.tutor?.first_name || '',
      tutor_last_name:    s.tutor?.last_name  || '',
      tutor_name:         `${s.tutor?.first_name || ''} ${s.tutor?.last_name || ''}`.trim(),
      tutor_email:        s.tutor?.email || '',
      tutor_timezone:     s.tutor?.timezone || null,
      tutor_username:     s.tutor?.username || null,
      student_email:      s.student?.email || '',
      student_notes:      s.notes || '',
      // Module name
      module_name:        s.module?.name || s.course?.title || '',
      // Normalise topic
      topic:              s.subject,
      // Whether this session has already been rated
      has_review:         !!s.review,
    }))

    return res.status(200).json({ success: true, data: { sessions: flat } })
  } catch (error) {
    console.error('Get sessions error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get upcoming sessions ────────────────────────────────────
// GET /api/v1/sessions/upcoming
// Protected — any role
export const getUpcomingSessions = async (req, res) => {
  try {
    const userId = req.user.userId
    const role   = req.user.role
    const today  = new Date()
    today.setHours(0, 0, 0, 0)

    const where = {
      scheduled_date: { gte: today },
      status:         { in: ['pending', 'confirmed'] },
      ...(role === 'student' ? { student_id: userId } : {}),
      ...(role === 'tutor'   ? { tutor_id:   userId } : {}),
    }

    const sessions = await prisma.session.findMany({
      where,
      orderBy: [{ scheduled_date: 'asc' }, { start_time: 'asc' }],
      take:    10,
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true } },
      },
    })

    return res.status(200).json({ success: true, data: { sessions } })
  } catch (error) {
    console.error('Get upcoming sessions error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get single session detail ────────────────────────────────
// GET /api/v1/sessions/:id
// Protected — participant or admin
export const getSessionById = async (req, res) => {
  try {
    const userId = req.user.userId
    const { id } = req.params

    const session = await prisma.session.findUnique({
      where:   { id },
      include: {
        student:       { select: { id: true, first_name: true, last_name: true, email: true } },
        tutor:         { select: { id: true, first_name: true, last_name: true, email: true } },
        attendance_log: true,
      },
    })

    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })

    const isParticipant = session.student_id === userId || session.tutor_id === userId || req.user.role === 'admin'
    if (!isParticipant) return res.status(403).json({ success: false, error: 'Not authorized' })

    return res.status(200).json({ success: true, data: { session } })
  } catch (error) {
    console.error('Get session error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get available slots for a tutor on a date ────────────────
// GET /api/v1/sessions/available?tutorId=xxx&date=2026-06-10&duration=60
// Protected — student only
export const getAvailableSlots = async (req, res) => {
  try {
    const { tutorId, date, duration = '60' } = req.query
    const durationMins = Math.max(15, parseInt(duration) || 60)

    if (!tutorId || !date) {
      return res.status(400).json({ success: false, error: 'tutorId and date are required' })
    }

    // Availability + slots are expressed in the tutor's timezone, so "today" and
    // "now" must be evaluated in that tz — not the server's UTC clock.
    const tutorRec = await prisma.user.findUnique({ where: { id: tutorId }, select: { timezone: true } })
    const tz = tutorRec?.timezone || 'UTC'

    // Reject past dates entirely (relative to the tutor's local date)
    const todayLocal = dateStrInTz(Date.now(), tz)
    if (date < todayLocal) {
      return res.status(400).json({ success: false, error: 'Cannot query available slots for past dates.' })
    }

    const isToday    = date === todayLocal
    const nowLocal   = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
    const [nowH, nowM] = nowLocal.split(':').map(Number)
    const nowLocalMins = nowH * 60 + nowM

    const selectedDate = new Date(date)
    const dayOfWeek    = selectedDate.toLocaleDateString('en-US', { weekday: 'long' })

    const slotToMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const minsToSlot = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

    const [availability, booked, busy] = await Promise.all([
      prisma.tutorAvailability.findMany({ where: { tutor_id: tutorId, day_of_week: dayOfWeek } }),
      prisma.session.findMany({
        where: { tutor_id: tutorId, scheduled_date: selectedDate, status: { in: ['pending', 'confirmed'] } },
        select: { start_time: true, end_time: true },
      }),
      prisma.tutorBusySlot.findMany({
        where: { tutor_id: tutorId, date: selectedDate },
        select: { start_time: true, end_time: true },
      }),
    ])

    // Generate duration-sized sub-slots from each availability block
    const subSlots = []
    for (const avail of availability) {
      let start = slotToMins(avail.start_time)
      const end = slotToMins(avail.end_time)
      while (start + durationMins <= end) {
        subSlots.push({ start_time: minsToSlot(start), end_time: minsToSlot(start + durationMins) })
        start += durationMins
      }
    }

    // Filter sub-slots that overlap with any booked session or busy slot, or are in the past
    const blocked = [...booked, ...busy]
    const available = subSlots.filter(slot => {
      const sStart = slotToMins(slot.start_time)
      const sEnd   = slotToMins(slot.end_time)
      if (blocked.some(b => slotToMins(b.start_time) < sEnd && slotToMins(b.end_time) > sStart)) return false
      if (isToday && sStart < nowLocalMins) return false
      return true
    })

    return res.status(200).json({
      success: true,
      data: {
        date,
        day_of_week:     dayOfWeek,
        duration_minutes: durationMins,
        available_slots: available,
        booked_count:    booked.length,
      },
    })
  } catch (error) {
    console.error('Get available slots error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Admin: get all sessions ──────────────────────────────────
// GET /api/v1/sessions/admin/all
// Protected — admin only
export const adminGetAllSessions = async (req, res) => {
  try {
    const { status, tutorId, studentId } = req.query
    const where = {}
    if (status)    where.status     = status
    if (tutorId)   where.tutor_id   = tutorId
    if (studentId) where.student_id = studentId

    const sessions = await prisma.session.findMany({
      where,
      orderBy: [{ scheduled_date: 'desc' }],
      take:    200,
      include: {
        student: { select: { id: true, first_name: true, last_name: true, email: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true, email: true } },
      },
    })

    return res.status(200).json({ success: true, data: { sessions } })
  } catch (error) {
    console.error('Admin get sessions error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Undo session completion ──────────────────────────────────
// PATCH /api/v1/sessions/:id/undo-complete
// Protected — tutor only
export const undoCompleteSession = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { id }  = req.params

    const session = await prisma.session.findUnique({ where: { id } })
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' })
    if (session.tutor_id !== tutorId) return res.status(403).json({ success: false, error: 'Not authorized' })
    if (session.status !== 'completed') return res.status(400).json({ success: false, error: 'Session is not completed' })

    // No credit movement here: the credit was held at booking and the session
    // returns to 'confirmed', which still holds it. Refunding would double-credit.
    const updated = await prisma.session.update({
      where: { id },
      data:  { status: 'confirmed', completed_at: null },
    })

    await prisma.notification.create({
      data: {
        user_id: session.student_id,
        title:   'Session completion undone',
        message: 'A session that was marked complete has been reversed. It is back on your schedule as confirmed.',
        type:    'info',
        sent_by: tutorId,
      },
    })

    return res.status(200).json({ success: true, data: { session: updated } })
  } catch (error) {
    console.error('Undo complete error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Tutor: get module students with sessions ─────────────────
// GET /api/v1/sessions/tutor/module-students
// Protected — tutor only
export const getTutorModuleStudents = async (req, res) => {
  try {
    const tutorId = req.user.userId

    // Modules this tutor is assigned to
    const moduleTutors = await prisma.moduleTutor.findMany({
      where: { tutor_id: tutorId },
      include: {
        module: { select: { id: true, name: true, display_order: true, short_description: true } },
      },
      orderBy: { module: { display_order: 'asc' } },
    })

    // Deduplicate by module_id (guard against any duplicate rows)
    const seenModules = new Set()
    const uniqueModuleTutors = moduleTutors.filter(mt => {
      if (seenModules.has(mt.module.id)) return false
      seenModules.add(mt.module.id)
      return true
    })

    const result = await Promise.all(
      uniqueModuleTutors.map(async (mt) => {
        // Students who have THIS tutor assigned for this module
        const enrollments = await prisma.moduleEnrollment.findMany({
          where:   { module_id: mt.module.id, tutor_id: tutorId, status: 'active' },
          include: {
            student: { select: { id: true, first_name: true, last_name: true, email: true, avatar_url: true } },
          },
        })

        const students = await Promise.all(
          enrollments.map(async (en) => {
            const [sessions, credit] = await Promise.all([
              prisma.session.findMany({
                where:   { student_id: en.student_id, tutor_id: tutorId, module_id: mt.module.id },
                orderBy: { scheduled_date: 'desc' },
                include: { slot: { select: { id: true, day_of_week: true } } },
              }),
              prisma.moduleCredit.findUnique({
                where: { student_id_module_id: { student_id: en.student_id, module_id: mt.module.id } },
              }),
            ])
            return {
              enrollment_id:     en.id,
              student:           en.student,
              credits_granted:   credit?.credits_granted  ?? 0,
              credits_used:      credit?.credits_used      ?? 0,
              credits_remaining: (credit?.credits_granted ?? 0) - (credit?.credits_used ?? 0),
              sessions,
            }
          })
        )

        return {
          module:   mt.module,
          students,
        }
      })
    )

    return res.json({ success: true, data: { modules: result } })
  } catch (error) {
    console.error('Tutor module students error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}