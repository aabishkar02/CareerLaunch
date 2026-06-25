import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ─── Student submits onboarding request ───────────────────────
// POST /api/v1/onboarding/request
export const submitOnboardingRequest = async (req, res) => {
  try {
    const studentId = req.user.userId
    const {
      preferred_tutor_id,
      schedule_preference,
      goals,
      message,
    } = req.body

    if (!schedule_preference || !goals?.length) {
      return res.status(400).json({
        success: false,
        error: 'schedule_preference and goals are required',
      })
    }

    // Check for existing pending request
    const existing = await prisma.onboardingRequest.findFirst({
      where: { student_id: studentId, status: 'pending' },
    })
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'You already have a pending onboarding request',
      })
    }

    const request = await prisma.onboardingRequest.create({
      data: {
        student_id:         studentId,
        preferred_tutor_id: preferred_tutor_id || null,
        schedule_preference,
        goals,
        message:            message || null,
        status:             'pending',
      },
      include: {
        student:         { select: { id: true, first_name: true, last_name: true, email: true } },
        preferred_tutor: { select: { id: true, first_name: true, last_name: true } },
      },
    })

    // Notify all admins
    const admins = await prisma.user.findMany({
      where:  { role: 'admin' },
      select: { id: true },
    })

    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map(a => ({
          user_id: a.id,
          title:   'New onboarding request',
          message: `${request.student.first_name} ${request.student.last_name} has submitted an onboarding request and needs a tutor assigned.`,
          type:    'info',
        })),
      })
    }

    // Mark user as having started onboarding
    await prisma.user.update({
      where: { id: studentId },
      data:  { onboarded: false }, // still false until admin completes
    })

    return res.status(201).json({ success: true, data: { request } })
  } catch (error) {
    console.error('Submit onboarding error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get student's own onboarding request ─────────────────────
// GET /api/v1/onboarding/my
export const getMyOnboardingRequest = async (req, res) => {
  try {
    const studentId = req.user.userId

    const request = await prisma.onboardingRequest.findFirst({
      where:   { student_id: studentId },
      orderBy: { created_at: 'desc' },
      include: {
        preferred_tutor: { select: { id: true, first_name: true, last_name: true } },
        assigned_tutor:  { select: { id: true, first_name: true, last_name: true, email: true } },
      },
    })

    return res.status(200).json({ success: true, data: { request } })
  } catch (error) {
    console.error('Get onboarding request error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get all tutors with profiles + ratings ───────────────────
// GET /api/v1/onboarding/tutors
// Public — student can browse before picking
export const getTutorsForOnboarding = async (req, res) => {
  try {
    const tutors = await prisma.user.findMany({
      where:   { role: 'tutor', suspended: false },
      select: {
        id:         true,
        first_name: true,
        last_name:  true,
        email:      true,
        avatar_url: true,
        bio:        true,
        tutor_profile: true,
        availability:  {
          select: { day_of_week: true, start_time: true, end_time: true, recurring: true },
        },
        reviews_received: {
          select: { rating: true, review_text: true, created_at: true,
            student: { select: { first_name: true, last_name: true } } },
          orderBy: { created_at: 'desc' },
          take: 5,
        },
      },
      orderBy: { first_name: 'asc' },
    })

    // Compute avg rating
    const enriched = tutors.map(t => {
      const ratings = t.reviews_received.map(r => r.rating)
      const avg = ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0
      return { ...t, avg_rating: Math.round(avg * 10) / 10, review_count: ratings.length }
    })

    return res.status(200).json({ success: true, data: { tutors: enriched } })
  } catch (error) {
    console.error('Get tutors error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Admin: get all onboarding requests ──────────────────────
// GET /api/v1/onboarding/admin/requests
export const adminGetOnboardingRequests = async (req, res) => {
  try {
    const { status } = req.query

    const requests = await prisma.onboardingRequest.findMany({
      where:   status ? { status } : {},
      orderBy: { created_at: 'desc' },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true, email: true, created_at: true },
        },
        preferred_tutor: {
          select: { id: true, first_name: true, last_name: true },
        },
        assigned_tutor: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    })

    return res.status(200).json({ success: true, data: { requests } })
  } catch (error) {
    console.error('Admin get onboarding requests error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Admin: assign tutor + send onboarding message ───────────
// POST /api/v1/onboarding/admin/assign
export const adminAssignTutorAndOnboard = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { request_id, tutor_id, admin_message, course_id } = req.body

    if (!request_id || !tutor_id) {
      return res.status(400).json({
        success: false,
        error: 'request_id and tutor_id are required',
      })
    }

    const request = await prisma.onboardingRequest.findUnique({
      where:   { id: request_id },
      include: { student: { select: { id: true, first_name: true, last_name: true, email: true } } },
    })

    if (!request) return res.status(404).json({ success: false, error: 'Request not found' })

    const tutor = await prisma.user.findUnique({
      where:  { id: tutor_id },
      select: { id: true, first_name: true, last_name: true },
    })
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found' })

    // 1. Update onboarding request
    const updated = await prisma.onboardingRequest.update({
      where: { id: request_id },
      data: {
        status:            'assigned',
        assigned_tutor_id: tutor_id,
        admin_message:     admin_message || null,
        admin_id:          adminId,
      },
    })

    // 2. End existing assignments, create new one
    await prisma.studentTutorAssignment.updateMany({
      where: { student_id: request.student_id, status: 'active' },
      data:  { status: 'ended', end_date: new Date() },
    })

    await prisma.studentTutorAssignment.create({
      data: {
        student_id:  request.student_id,
        tutor_id,
        start_date:  new Date(),
        status:      'active',
        assigned_by: adminId,
        notes:       admin_message || null,
      },
    })

    // 3. Enroll in course if provided
    if (course_id) {
      await prisma.enrollment.upsert({
        where:  { student_id_course_id: { student_id: request.student_id, course_id } },
        update: { status: 'active' },
        create: {
          student_id:  request.student_id,
          course_id,
          plan_type:   'single',
          status:      'active',
          enrolled_by: adminId,
        },
      })
    }

    // 4. Mark student as onboarded
    await prisma.user.update({
      where: { id: request.student_id },
      data:  { onboarded: true },
    })

    // 5. Send onboarding notification to student
    const welcomeMsg = admin_message ||
      `Welcome! You have been assigned to ${tutor.first_name} ${tutor.last_name} as your tutor. They will be in touch shortly to schedule your first session.`

    await prisma.notification.create({
      data: {
        user_id: request.student_id,
        title:   'Welcome to CareerLaunch! Your tutor has been assigned.',
        message: welcomeMsg,
        type:    'info',
        sent_by: adminId,
      },
    })

    // 6. Notify tutor
    await prisma.notification.create({
      data: {
        user_id: tutor_id,
        title:   'New student assigned via onboarding',
        message: `${request.student.first_name} ${request.student.last_name} has been assigned to you. Check their profile and reach out to schedule a session.`,
        type:    'info',
        sent_by: adminId,
      },
    })

    // 7. Audit
    await prisma.auditLog.create({
      data: {
        actor_id:       adminId,
        target_user_id: request.student_id,
        action:         'onboarding.assigned',
        entity_type:    'onboarding_request',
        entity_id:      request_id,
        new_value:      { tutor_id, admin_message },
      },
    })

    return res.status(200).json({
      success: true,
      message: 'Tutor assigned and student onboarded successfully',
      data:    { request: updated },
    })
  } catch (error) {
    console.error('Admin assign onboarding error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Admin: send custom onboarding message ────────────────────
// POST /api/v1/onboarding/admin/message
export const adminSendOnboardingMessage = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { student_id, message, title } = req.body

    if (!student_id || !message) {
      return res.status(400).json({ success: false, error: 'student_id and message are required' })
    }

    await prisma.notification.create({
      data: {
        user_id: student_id,
        title:   title || 'Message from CareerLaunch',
        message,
        type:    'info',
        sent_by: adminId,
      },
    })

    return res.status(200).json({ success: true, message: 'Onboarding message sent' })
  } catch (error) {
    console.error('Send onboarding message error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get tutor profile ────────────────────────────────────────
// GET /api/v1/onboarding/tutors/:id
export const getTutorProfile = async (req, res) => {
  try {
    const { id } = req.params

    const tutor = await prisma.user.findUnique({
      where:  { id, role: 'tutor' },
      select: {
        id:         true,
        first_name: true,
        last_name:  true,
        email:      true,
        bio:        true,
        avatar_url: true,
        tutor_profile: true,
        availability: {
          orderBy: { day_of_week: 'asc' },
        },
        tutor_busy_slots: {
          where: { date: { gte: new Date() } },
          orderBy: { date: 'asc' },
        },
        reviews_received: {
          include: {
            student: { select: { first_name: true, last_name: true } },
          },
          orderBy: { created_at: 'desc' },
        },
      },
    })

    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found' })

    const ratings   = tutor.reviews_received.map(r => r.rating)
    const avg       = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
    const enriched  = { ...tutor, avg_rating: Math.round(avg * 10) / 10, review_count: ratings.length }

    return res.status(200).json({ success: true, data: { tutor: enriched } })
  } catch (error) {
    console.error('Get tutor profile error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Tutor fetches own profile ────────────────────────────────
// GET /api/v1/onboarding/tutors/me/profile
export const getMyTutorProfile = async (req, res) => {
  try {
    const tutorId = req.user.userId

    const profile = await prisma.tutorProfile.findUnique({
      where: { tutor_id: tutorId },
    })

    return res.status(200).json({ success: true, data: { profile: profile || null } })
  } catch (error) {
    console.error('Get my tutor profile error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Tutor updates own profile / qualifications ───────────────
// PUT /api/v1/onboarding/tutors/me/profile
export const updateTutorProfile = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { bio, qualifications, specialisations, experience_years, linkedin_url, github_url } = req.body

    const profile = await prisma.tutorProfile.upsert({
      where:  { tutor_id: tutorId },
      update: {
        bio:              bio || null,
        qualifications:   qualifications || [],
        specialisations:  specialisations || [],
        experience_years: experience_years || 0,
        linkedin_url:     linkedin_url || null,
        github_url:       github_url || null,
      },
      create: {
        tutor_id:         tutorId,
        bio:              bio || null,
        qualifications:   qualifications || [],
        specialisations:  specialisations || [],
        experience_years: experience_years || 0,
        linkedin_url:     linkedin_url || null,
        github_url:       github_url || null,
      },
    })

    // Also update user bio
    await prisma.user.update({
      where: { id: tutorId },
      data:  { bio: bio || null },
    })

    return res.status(200).json({ success: true, data: { profile } })
  } catch (error) {
    console.error('Update tutor profile error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Student rates tutor ──────────────────────────────────────
// POST /api/v1/onboarding/tutors/:id/review
export const rateTutor = async (req, res) => {
  try {
    const studentId = req.user.userId
    const tutorId   = req.params.id
    const { rating, review_text, session_id } = req.body

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' })
    }

    if (!session_id) {
      return res.status(400).json({ success: false, error: 'session_id is required' })
    }

    // Verify the session exists, is completed, and belongs to this student+tutor
    const session = await prisma.session.findFirst({
      where: { id: session_id, student_id: studentId, tutor_id: tutorId, status: 'completed' },
    })
    if (!session) {
      return res.status(403).json({
        success: false,
        error: 'You can only rate a tutor after completing a session with them',
      })
    }

    // Check if this session has already been rated
    const existing = await prisma.tutorReview.findUnique({ where: { session_id } })
    if (existing) {
      return res.status(409).json({ success: false, error: 'already_rated', message: 'You have already rated this session' })
    }

    const visibleAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // visible after 24h

    const review = await prisma.tutorReview.create({
      data: { tutor_id: tutorId, student_id: studentId, session_id, rating, review_text: review_text || null, visible_at: visibleAt },
    })

    // Only update cached rating from reviews that have passed the 24h visibility window
    // This prevents tutors from identifying which student gave a specific rating
    const visibleReviews = await prisma.tutorReview.findMany({
      where: {
        tutor_id: tutorId,
        OR: [{ visible_at: { lte: new Date() } }, { visible_at: null }],
      },
    })

    if (visibleReviews.length > 0) {
      const avg = visibleReviews.reduce((a, b) => a + b.rating, 0) / visibleReviews.length
      await prisma.tutorProfile.upsert({
        where:  { tutor_id: tutorId },
        update: { rating: avg, review_count: visibleReviews.length },
        create: { tutor_id: tutorId, rating: avg, review_count: visibleReviews.length },
      })
    }

    return res.status(200).json({ success: true, data: { review } })
  } catch (error) {
    console.error('Rate tutor error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}