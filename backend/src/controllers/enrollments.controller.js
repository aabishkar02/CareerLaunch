import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ─── GET /api/v1/enrollments ──────────────────────────────────
// Returns all module-level enrollments for the authenticated student.
// Tries ModuleEnrollment (new managed system) first, falls back to
// Enrollment + CourseModule (legacy system).
export const getMyEnrollments = async (req, res) => {
  try {
    const studentId = req.user.userId

    // ── Try new managed ModuleEnrollment first ─────────────────
    const moduleEnrollments = await prisma.moduleEnrollment.findMany({
      where:   { student_id: studentId, status: 'active' },
      orderBy: { enrolled_at: 'asc' },
      include: {
        module: {
          select: {
            id:                true,
            name:              true,
            short_description: true,
            display_order:     true,
          },
        },
        course: {
          select: { id: true, title: true, category: true, slug: true },
        },
        tutor: {
          select: { id: true, first_name: true, last_name: true, avatar_url: true },
        },
      },
    })

    // Build new-system enrollment list (empty array if none)
    let enrollments = []

    if (moduleEnrollments.length > 0) {
      const moduleIds = moduleEnrollments.map(e => e.module_id)
      const credits = await prisma.moduleCredit.findMany({
        where: { student_id: studentId, module_id: { in: moduleIds } },
      })
      const creditMap = Object.fromEntries(credits.map(c => [c.module_id, c]))

      const recentSessions = await prisma.session.findMany({
        where: {
          student_id: studentId,
          module_id:  { in: moduleIds },
          created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          status:     { in: ['pending', 'confirmed'] },
        },
        select: { module_id: true },
      })
      const activitySet = new Set(recentSessions.map(s => s.module_id))

      enrollments = moduleEnrollments.map(e => {
        const cr      = creditMap[e.module_id]
        const granted = cr?.credits_granted ?? 5
        const used    = cr?.credits_used    ?? 0
        return {
          id:                  e.id,
          enrollment_type:     'module',
          module_id:           e.module_id,
          module_name:         e.module.name,
          name:                e.module.name,
          description:         e.module.short_description || '',
          category:            e.course?.category || '',
          credits_remaining:   granted - used,
          credits_total:       granted,
          credits_per_session: 1,
          status:              e.status,
          enrolled_at:         e.enrolled_at,
          has_new_activity:    activitySet.has(e.module_id),
          tutor:               e.tutor,
          course: {
            id:       e.course_id,
            title:    e.course?.title,
            slug:     e.course?.slug,
            category: e.course?.category,
          },
        }
      })
    }

    // Also include legacy enrollments, but only for module_ids NOT already covered
    // by the new system. This prevents duplicates if a student was migrated.
    const newModuleIds = new Set(enrollments.map(e => e.module_id))

    const legacyEnrollments = await prisma.enrollment.findMany({
      where:   { student_id: studentId, status: 'active' },
      orderBy: { enrolled_at: 'desc' },
      include: {
        course: {
          include: {
            modules: {
              where:   { published: true },
              orderBy: { order_index: 'asc' },
            },
          },
        },
      },
    })

    const allLegacyModuleIds = legacyEnrollments
      .flatMap(e => e.course.modules.map(m => m.id))
      .filter(id => !newModuleIds.has(id)) // skip modules already in new system

    if (allLegacyModuleIds.length > 0) {
      const legacyCredits = await prisma.moduleCredit.findMany({
        where: { student_id: studentId, module_id: { in: allLegacyModuleIds } },
      })
      const legacyCreditMap = Object.fromEntries(legacyCredits.map(c => [c.module_id, c]))

      const legacyFlat = legacyEnrollments.flatMap(en =>
        en.course.modules
          .filter(m => !newModuleIds.has(m.id))
          .map(m => {
            const cr      = legacyCreditMap[m.id]
            const granted = cr?.credits_granted ?? 5
            const used    = cr?.credits_used    ?? 0
            return {
              id:                  `${en.id}-${m.id}`,
              enrollment_type:     'legacy',
              enrollment_id:       en.id,
              module_id:           m.id,
              module_name:         m.title,
              name:                m.title,
              description:         m.description || '',
              category:            en.course.category || '',
              credits_remaining:   granted - used,
              credits_total:       granted,
              credits_per_session: 1,
              status:              en.status,
              enrolled_at:         en.enrolled_at,
              has_new_activity:    false,
              course: {
                id:       en.course_id,
                title:    en.course.title,
                slug:     en.course.slug,
                category: en.course.category,
              },
            }
          })
      )

      enrollments = [...enrollments, ...legacyFlat]
    }

    return res.json({ success: true, data: { enrollments } })
  } catch (e) {
    console.error('getMyEnrollments error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── GET /api/v1/enrollments/:id/materials ────────────────────
// Returns materials for the module in this enrollment.
export const getEnrollmentMaterials = async (req, res) => {
  try {
    const studentId    = req.user.userId
    const enrollmentId = req.params.id

    // Resolve module_id from either ModuleEnrollment or compound ID
    let moduleId = null

    // Try ModuleEnrollment first
    const me = await prisma.moduleEnrollment.findFirst({
      where: { id: enrollmentId, student_id: studentId },
    })
    if (me) {
      moduleId = me.module_id
    } else {
      // Try legacy: enrollmentId might be "enrollmentId-moduleId"
      const parts = enrollmentId.split('-')
      if (parts.length >= 2) {
        // Last segment might be UUID — try the compound format
        // Try finding by enrollment
        const en = await prisma.enrollment.findFirst({
          where:   { id: parts.slice(0, 5).join('-'), student_id: studentId },
          include: { course: { include: { modules: { where: { published: true } } } } },
        })
        if (en && en.course.modules.length > 0) {
          // Try to match module by tail of compound id
          const modId = parts.slice(5).join('-')
          const mod   = en.course.modules.find(m => m.id === modId)
          moduleId = mod?.id || en.course.modules[0]?.id
        }
      }
    }

    if (!moduleId) {
      return res.status(404).json({ success: false, error: 'Enrollment not found' })
    }

    const materials = await prisma.moduleMaterial.findMany({
      where:   { module_id: moduleId, type: { in: ['student', 'all'] } },
      orderBy: { order_index: 'asc' },
    })

    return res.json({
      success: true,
      data:    { materials: materials.map(m => ({ ...m, is_new: false })) },
    })
  } catch (e) {
    console.error('getEnrollmentMaterials error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── GET /api/v1/enrollments/:id/tutor ───────────────────────
// Returns the tutor assigned to this enrollment.
export const getEnrollmentTutor = async (req, res) => {
  try {
    const studentId    = req.user.userId
    const enrollmentId = req.params.id

    // Try ModuleEnrollment.tutor_id
    const me = await prisma.moduleEnrollment.findFirst({
      where:   { id: enrollmentId, student_id: studentId },
      include: {
        tutor: {
          include: {
            tutor_profile: { select: { bio: true } },
            reviews_received: {
              select: { rating: true },
            },
          },
        },
      },
    })

    if (me?.tutor) {
      const ratings = me.tutor.reviews_received.map(r => r.rating)
      const avg     = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
      return res.json({
        success: true,
        data:    {
          tutor: {
            id:             me.tutor.id,
            first_name:     me.tutor.first_name,
            last_name:      me.tutor.last_name,
            email:          me.tutor.email,
            avatar_url:     me.tutor.avatar_url,
            bio:            me.tutor.tutor_profile?.bio || me.tutor.bio,
            headline:       `${me.tutor.first_name} ${me.tutor.last_name}`,
            average_rating: avg ? parseFloat(avg.toFixed(2)) : null,
            review_count:   ratings.length,
          },
        },
      })
    }

    // Fallback: StudentTutorAssignment
    const assignment = await prisma.studentTutorAssignment.findFirst({
      where:   { student_id: studentId, enrollment_id: enrollmentId, status: 'active' },
      include: {
        tutor: {
          select: {
            id: true, first_name: true, last_name: true,
            email: true, avatar_url: true, bio: true,
          },
        },
      },
    })

    return res.json({
      success: true,
      data:    { tutor: assignment?.tutor || null },
    })
  } catch (e) {
    console.error('getEnrollmentTutor error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── GET /api/v1/enrollments/:id/tutors ──────────────────────
// Returns all tutors available for the module in this enrollment.
export const getEnrollmentTutors = async (req, res) => {
  try {
    const studentId    = req.user.userId
    const enrollmentId = req.params.id

    let moduleId = null
    let courseId = null

    const me = await prisma.moduleEnrollment.findFirst({
      where: { id: enrollmentId, student_id: studentId },
    })
    if (me) { moduleId = me.module_id; courseId = me.course_id }

    let tutors = []

    if (moduleId) {
      const moduleTutors = await prisma.moduleTutor.findMany({
        where:   { module_id: moduleId },
        include: {
          tutor: {
            select: {
              id: true, first_name: true, last_name: true,
              email: true, avatar_url: true, bio: true,
              reviews_received: { select: { rating: true } },
            },
          },
        },
      })
      tutors = moduleTutors.map(mt => {
        const ratings = mt.tutor.reviews_received.map(r => r.rating)
        const avg     = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
        return {
          id:             mt.tutor.id,
          first_name:     mt.tutor.first_name,
          last_name:      mt.tutor.last_name,
          email:          mt.tutor.email,
          avatar_url:     mt.tutor.avatar_url,
          bio:            mt.tutor.bio,
          average_rating: avg ? parseFloat(avg.toFixed(2)) : null,
          review_count:   ratings.length,
        }
      })
    }

    return res.json({ success: true, data: { tutors } })
  } catch (e) {
    console.error('getEnrollmentTutors error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── GET /api/v1/enrollments/teaching ────────────────────────
// Tutor: all modules they're approved for + students assigned to them.
export const getTeachingEnrollments = async (req, res) => {
  try {
    const tutorId = req.user.userId

    // All modules this tutor is approved for (via ModuleTutor)
    const moduleTutors = await prisma.moduleTutor.findMany({
      where:   { tutor_id: tutorId },
      include: {
        module: {
          select: { id: true, name: true, short_description: true, category: true },
        },
      },
    })

    // For each approved module, get students who have selected this tutor
    const courses = await Promise.all(moduleTutors.map(async (mt) => {
      const enrollments = await prisma.moduleEnrollment.findMany({
        where:   { module_id: mt.module_id, tutor_id: tutorId, status: 'active' },
        include: {
          student: { select: { id: true, first_name: true, last_name: true, email: true } },
        },
      })

      const credits = await prisma.moduleCredit.findMany({
        where: { module_id: mt.module_id, student_id: { in: enrollments.map(e => e.student_id) } },
      })
      const creditMap = Object.fromEntries(credits.map(c => [c.student_id, c.credits_granted - c.credits_used]))

      return {
        id:           mt.module_id,
        name:         mt.module.name,
        category:     mt.module.category || '',
        description:  mt.module.short_description || '',
        students:     enrollments.length,
        students_list: enrollments.map(e => ({
          id:                e.student_id,
          first_name:        e.student.first_name,
          last_name:         e.student.last_name,
          email:             e.student.email,
          credits_remaining: creditMap[e.student_id] ?? 0,
        })),
      }
    }))

    return res.json({ success: true, data: { courses } })
  } catch (e) {
    console.error('getTeachingEnrollments error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}
