import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ─── Get my enrollments ───────────────────────────────────────
// GET /api/v1/students/me/enrollments
// Protected — student only

export const getMyEnrollments = async (req, res) => {
  try {
    const studentId = req.user.userId

    const enrollments = await prisma.enrollment.findMany({
      where:   { student_id: studentId },
      orderBy: { enrolled_at: 'desc' },
      include: {
        course: {
          include: {
            modules: {
              orderBy: { order_index: 'asc' },
              where:   { published: true },
            },
            pricing_plans: {
              where: { active: true },
              take:  1,
            },
          },
        },
        payment: {
          select: {
            id:           true,
            amount_cents: true,
            status:       true,
            receipt_url:  true,
            created_at:   true,
          },
        },
      },
    })

    // For each enrollment, find the assigned tutor (scoped to that enrollment)
    const enriched = await Promise.all(
      enrollments.map(async (en) => {
        const assignment = await prisma.studentTutorAssignment.findFirst({
          where:   { student_id: studentId, enrollment_id: en.id, status: 'active' },
          include: {
            tutor: {
              select: {
                id:         true,
                first_name: true,
                last_name:  true,
                email:      true,
                avatar_url: true,
                bio:        true,
              },
            },
          },
        })

        return {
          ...en,
          tutor: assignment?.tutor || null,
        }
      })
    )

    return res.status(200).json({
      success: true,
      data:    { enrollments: enriched },
    })
  } catch (error) {
    console.error('Get enrollments error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my sessions (all) ────────────────────────────────────
// GET /api/v1/students/me/sessions
// Protected — student only

export const getMySessions = async (req, res) => {
  try {
    const studentId = req.user.userId

    const sessions = await prisma.session.findMany({
      where:   { student_id: studentId },
      orderBy: { scheduled_date: 'asc' },
      include: {
        tutor: {
          select: {
            id:         true,
            first_name: true,
            last_name:  true,
            email:      true,
            avatar_url: true,
          },
        },
        slot: {
          select: {
            id:         true,
            day_of_week: true,
            start_time: true,
            end_time:   true,
          },
        },
      },
    })

    return res.status(200).json({
      success: true,
      data:    { sessions },
    })
  } catch (error) {
    console.error('Get sessions error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get upcoming sessions ────────────────────────────────────
// GET /api/v1/students/me/sessions/upcoming
// Protected — student only

export const getUpcomingSessions = async (req, res) => {
  try {
    const studentId = req.user.userId
    const today     = new Date()
    today.setHours(0, 0, 0, 0)

    const sessions = await prisma.session.findMany({
      where: {
        student_id:     studentId,
        scheduled_date: { gte: today },
        status:         { in: ['pending', 'confirmed'] },
      },
      orderBy: { scheduled_date: 'asc' },
      take:    5,
      include: {
        tutor: {
          select: {
            id:         true,
            first_name: true,
            last_name:  true,
            email:      true,
          },
        },
      },
    })

    return res.status(200).json({
      success: true,
      data:    { sessions },
    })
  } catch (error) {
    console.error('Get upcoming sessions error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my progress ──────────────────────────────────────────
// GET /api/v1/students/me/progress
// Protected — student only

export const getMyProgress = async (req, res) => {
  try {
    const studentId = req.user.userId

    const progress = await prisma.studentProgress.findMany({
      where:   { student_id: studentId },
      include: {
        module: {
          select: {
            id:            true,
            name:          true,
            display_order: true,
          },
        },
        course: {
          select: {
            id:    true,
            title: true,
            slug:  true,
          },
        },
      },
      orderBy: { module: { order_index: 'asc' } },
    })

    // Group by course and compute percent
    const byCourse = {}
    for (const p of progress) {
      const cid = p.course_id
      if (!byCourse[cid]) {
        byCourse[cid] = {
          course:    p.course,
          modules:   [],
          completed: 0,
          total:     0,
        }
      }
      byCourse[cid].modules.push(p)
      byCourse[cid].total += 1
      if (p.status === 'completed') byCourse[cid].completed += 1
    }

    const summary = Object.values(byCourse).map(c => ({
      ...c,
      percent: c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0,
    }))

    return res.status(200).json({
      success: true,
      data:    { progress: summary },
    })
  } catch (error) {
    console.error('Get progress error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Mark module complete ─────────────────────────────────────
// PATCH /api/v1/students/me/progress/:moduleId
// Protected — student only

export const updateModuleProgress = async (req, res) => {
  try {
    const studentId = req.user.userId
    const { moduleId } = req.params
    const { status } = req.body

    if (!['in_progress', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error:   'Status must be in_progress or completed',
      })
    }

    const mod = await prisma.courseModule.findUnique({
      where: { id: moduleId },
    })
    if (!mod) {
      return res.status(404).json({ success: false, error: 'Module not found' })
    }

    const progress = await prisma.studentProgress.upsert({
      where:  { student_id_module_id: { student_id: studentId, module_id: moduleId } },
      update: {
        status,
        completed_at: status === 'completed' ? new Date() : null,
        started_at:   status === 'in_progress' ? new Date() : undefined,
      },
      create: {
        student_id:  studentId,
        module_id:   moduleId,
        course_id:   mod.course_id,
        status,
        started_at:  new Date(),
        completed_at: status === 'completed' ? new Date() : null,
      },
    })

    return res.status(200).json({
      success: true,
      data:    { progress },
    })
  } catch (error) {
    console.error('Update progress error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my assignments ───────────────────────────────────────
// GET /api/v1/students/me/assignments
// Protected — student only

export const getMyAssignments = async (req, res) => {
  try {
    const studentId = req.user.userId

    const assignmentStudents = await prisma.assignmentStudent.findMany({
      where: { student_id: studentId },
      include: {
        assignment: {
          include: {
            tutor: {
              select: { id: true, first_name: true, last_name: true },
            },
            files:       true,
            submissions: {
              where:  { student_id: studentId },
              take:   1,
            },
          },
        },
      },
      orderBy: { assignment: { due_date: 'asc' } },
    })

    const assignments = assignmentStudents.map(as => ({
      ...as.assignment,
      my_submission: as.assignment.submissions[0] || null,
      submissions:   undefined, // clean up
    }))

    return res.status(200).json({
      success: true,
      data:    { assignments },
    })
  } catch (error) {
    console.error('Get assignments error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my notifications ─────────────────────────────────────
// GET /api/v1/students/me/notifications
// Protected — student only

export const getMyNotifications = async (req, res) => {
  try {
    const studentId = req.user.userId

    const notifications = await prisma.notification.findMany({
      where:   { user_id: studentId },
      orderBy: { created_at: 'desc' },
      take:    20,
    })

    const unread = await prisma.notification.count({
      where: { user_id: studentId, read: false },
    })

    return res.status(200).json({
      success: true,
      data:    { notifications, unread_count: unread },
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Mark notification read ───────────────────────────────────
// PATCH /api/v1/notifications/:id/read
// Protected — any user

export const markNotificationRead = async (req, res) => {
  try {
    const { id }    = req.params
    const studentId = req.user.userId

    await prisma.notification.updateMany({
      where: { id, user_id: studentId },
      data:  { read: true, read_at: new Date() },
    })

    return res.status(200).json({ success: true, message: 'Marked as read' })
  } catch (error) {
    console.error('Mark read error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Mark all notifications read ─────────────────────────────
// PATCH /api/v1/notifications/read-all
// Protected — any user

export const markAllNotificationsRead = async (req, res) => {
  try {
    const studentId = req.user.userId

    await prisma.notification.updateMany({
      where: { user_id: studentId, read: false },
      data:  { read: true, read_at: new Date() },
    })

    return res.status(200).json({ success: true, message: 'All notifications marked as read' })
  } catch (error) {
    console.error('Mark all read error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my module enrollments ────────────────────────────────
// GET /api/v1/students/me/module-enrollments
export const getMyModuleEnrollments = async (req, res) => {
  try {
    const studentId = req.user.userId

    const enrollments = await prisma.moduleEnrollment.findMany({
      where:   { student_id: studentId },
      orderBy: { module: { display_order: 'asc' } },
      include: {
        module: {
          select: { id: true, name: true, display_order: true, short_description: true, full_description: true, credit_cost: true, slug: true, category: true },
        },
        tutor: {
          select: { id: true, first_name: true, last_name: true, email: true, avatar_url: true, bio: true },
        },
      },
    })

    // For each enrollment, attach available tutors + credit info
    const enriched = await Promise.all(
      enrollments.map(async (en) => {
        const [moduleTutors, credit] = await Promise.all([
          prisma.moduleTutor.findMany({
            where: { module_id: en.module_id },
            include: {
              tutor: {
                select: {
                  id: true, first_name: true, last_name: true, email: true, avatar_url: true, bio: true,
                  tutor_profile: { select: { rating: true, review_count: true, experience_years: true } },
                },
              },
            },
          }),
          prisma.moduleCredit.findUnique({
            where: { student_id_module_id: { student_id: en.student_id, module_id: en.module_id } },
          }),
        ])
        return {
          ...en,
          credits_granted:  credit?.credits_granted  ?? 0,
          credits_used:     credit?.credits_used      ?? 0,
          credits_remaining: (credit?.credits_granted ?? 0) - (credit?.credits_used ?? 0),
          available_tutors: moduleTutors.map(mt => mt.tutor),
        }
      })
    )

    return res.json({ success: true, data: { enrollments: enriched } })
  } catch (error) {
    console.error('Get module enrollments error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Student self-selects tutor for a MODULE enrollment ───────
// POST /api/v1/students/me/module-enrollments/:id/select-tutor
export const selectTutorForModule = async (req, res) => {
  try {
    const studentId = req.user.userId
    const { id }    = req.params
    const { tutor_id } = req.body

    if (!tutor_id) return res.status(400).json({ success: false, error: 'tutor_id is required' })

    const enrollment = await prisma.moduleEnrollment.findFirst({
      where: { id, student_id: studentId, status: 'active' },
    })
    if (!enrollment) return res.status(404).json({ success: false, error: 'Module enrollment not found' })

    const mt = await prisma.moduleTutor.findUnique({
      where: { module_id_tutor_id: { module_id: enrollment.module_id, tutor_id } },
    })
    if (!mt) return res.status(400).json({ success: false, error: 'This tutor is not approved for this module' })

    const updated = await prisma.moduleEnrollment.update({
      where: { id },
      data:  { tutor_id },
      include: {
        tutor:  { select: { id: true, first_name: true, last_name: true } },
        module: { select: { id: true, name: true } },
      },
    })

    await prisma.notification.create({
      data: {
        user_id: tutor_id,
        title:   'New student selected you',
        message: `A student selected you as their tutor for module: ${updated.module.name}.`,
        type:    'info',
        sent_by: studentId,
      },
    })

    return res.status(200).json({ success: true, data: { enrollment: updated } })
  } catch (error) {
    console.error('Select module tutor error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Student self-selects a tutor for an enrollment ──────────
// POST /api/v1/students/me/enrollments/:enrollmentId/select-tutor
// Protected — student only
export const selectTutor = async (req, res) => {
  try {
    const studentId     = req.user.userId
    const { enrollmentId } = req.params
    const { tutor_id }  = req.body

    if (!tutor_id) return res.status(400).json({ success: false, error: 'tutor_id is required' })

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, student_id: studentId, status: 'active' },
    })
    if (!enrollment) return res.status(404).json({ success: false, error: 'Enrollment not found' })

    // Tutor must be assigned to this course
    const courseTutor = await prisma.courseTutor.findUnique({
      where: { course_id_tutor_id: { course_id: enrollment.course_id, tutor_id } },
    })
    if (!courseTutor) {
      return res.status(400).json({ success: false, error: 'This tutor is not available for this course' })
    }

    // End any prior active assignment for this enrollment
    await prisma.studentTutorAssignment.updateMany({
      where: { enrollment_id: enrollmentId, status: 'active' },
      data:  { status: 'ended', end_date: new Date() },
    })

    const assignment = await prisma.studentTutorAssignment.create({
      data: {
        student_id:    studentId,
        tutor_id,
        enrollment_id: enrollmentId,
        start_date:    new Date(),
        status:        'active',
      },
      include: {
        tutor: { select: { id: true, first_name: true, last_name: true, email: true, avatar_url: true } },
      },
    })

    await prisma.notification.create({
      data: {
        user_id: tutor_id,
        title:   'New student selected you',
        message: 'A student has selected you as their tutor for a course.',
        type:    'info',
        sent_by: studentId,
      },
    })

    return res.status(201).json({ success: true, data: { assignment } })
  } catch (error) {
    console.error('Select tutor error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my certifications ────────────────────────────────────
// GET /api/v1/students/me/certifications
// Protected — student only

export const getMyCertifications = async (req, res) => {
  try {
    const studentId = req.user.userId

    const certifications = await prisma.certification.findMany({
      where:   { student_id: studentId },
      orderBy: { created_at: 'desc' },
      include: {
        course:  { select: { id: true, title: true, slug: true } },
        module:  { select: { id: true, name: true, slug: true } },
        tutor:   { select: { id: true, first_name: true, last_name: true, avatar_url: true } },
        approver:{ select: { id: true, first_name: true, last_name: true } },
      },
    })

    return res.status(200).json({
      success: true,
      data:    { certifications },
    })
  } catch (error) {
    console.error('Get certifications error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}