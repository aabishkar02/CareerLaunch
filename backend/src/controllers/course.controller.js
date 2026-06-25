import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ─── Public: list published courses ──────────────────────────
// GET /api/v1/courses?category=x&search=x
export const getCourses = async (req, res) => {
  try {
    const { category, search, featured } = req.query
    const where = { published: true }
    if (category) where.category = category
    if (featured === 'true') where.featured = true
    if (search) {
      where.OR = [
        { title:       { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const courses = await prisma.course.findMany({
      where,
      orderBy: [{ featured: 'desc' }, { created_at: 'desc' }],
      include: {
        pricing_plans: { where: { active: true }, orderBy: { price_cents: 'asc' } },
        course_tutors: {
          include: {
            tutor: {
              select: { id: true, first_name: true, last_name: true, avatar_url: true },
            },
          },
        },
        _count: { select: { enrollments: true, course_tutors: true } },
      },
    })

    return res.json({ success: true, data: { courses } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Public: course detail by slug ───────────────────────────
// GET /api/v1/courses/:slug
export const getCourseBySlug = async (req, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { slug: req.params.slug },
      include: {
        modules: { where: { published: true }, orderBy: { order_index: 'asc' } },
        pricing_plans: { where: { active: true }, orderBy: { price_cents: 'asc' } },
        course_tutors: {
          include: {
            tutor: {
              select: {
                id: true, first_name: true, last_name: true, avatar_url: true, bio: true,
                tutor_profile: {
                  select: { rating: true, review_count: true, experience_years: true, specialisations: true },
                },
              },
            },
          },
        },
        _count: { select: { enrollments: true } },
      },
    })

    if (!course || !course.published) {
      return res.status(404).json({ success: false, error: 'Course not found' })
    }

    return res.json({ success: true, data: { course } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: create course ─────────────────────────────────────
// POST /api/v1/courses
export const createCourse = async (req, res) => {
  try {
    const { title, slug, description, category, thumbnail_url, featured, pricing_plans } = req.body

    if (!title || !slug || !description) {
      return res.status(400).json({ success: false, error: 'title, slug and description are required' })
    }

    const existing = await prisma.course.findUnique({ where: { slug } })
    if (existing) {
      return res.status(409).json({ success: false, error: 'A course with this slug already exists' })
    }

    const course = await prisma.course.create({
      data: {
        title,
        slug,
        description,
        category:      category      || null,
        thumbnail_url: thumbnail_url || null,
        featured:      featured      || false,
        published:     false,
        created_by:    req.user.userId,
        pricing_plans: pricing_plans?.length
          ? { create: pricing_plans.map(p => ({
              plan_type:   p.plan_type,
              price_cents: p.price_cents,
              currency:    p.currency || 'usd',
              description: p.description || null,
              active:      true,
            })) }
          : undefined,
      },
      include: { pricing_plans: true },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:    req.user.userId,
        action:      'course.created',
        entity_type: 'course',
        entity_id:   course.id,
        new_value:   { title, slug, category: category || null },
      },
    }).catch(() => {})

    return res.status(201).json({ success: true, data: { course } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: update course ─────────────────────────────────────
// PATCH /api/v1/courses/:id
export const updateCourse = async (req, res) => {
  try {
    const { title, slug, description, category, thumbnail_url, featured } = req.body

    if (slug) {
      const conflict = await prisma.course.findFirst({
        where: { slug, NOT: { id: req.params.id } },
      })
      if (conflict) return res.status(409).json({ success: false, error: 'Slug already taken' })
    }

    const old = await prisma.course.findUnique({ where: { id: req.params.id }, select: { title: true, slug: true } })

    const course = await prisma.course.update({
      where: { id: req.params.id },
      data: {
        ...(title         !== undefined && { title }),
        ...(slug          !== undefined && { slug }),
        ...(description   !== undefined && { description }),
        ...(category      !== undefined && { category }),
        ...(thumbnail_url !== undefined && { thumbnail_url }),
        ...(featured      !== undefined && { featured }),
      },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:    req.user.userId,
        action:      'course.updated',
        entity_type: 'course',
        entity_id:   course.id,
        old_value:   old ? { title: old.title, slug: old.slug } : null,
        new_value:   { title: course.title, slug: course.slug },
      },
    }).catch(() => {})

    return res.json({ success: true, data: { course } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: publish / unpublish course ───────────────────────
// PATCH /api/v1/courses/:id/publish
export const togglePublish = async (req, res) => {
  try {
    const { published } = req.body
    const course = await prisma.course.update({
      where: { id: req.params.id },
      data:  { published: !!published },
    })
    await prisma.auditLog.create({
      data: {
        actor_id:    req.user.userId,
        action:      published ? 'course.published' : 'course.unpublished',
        entity_type: 'course',
        entity_id:   course.id,
        new_value:   { title: course.title, published: !!published },
      },
    }).catch(() => {})
    return res.json({ success: true, data: { course } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: delete course ─────────────────────────────────────
// DELETE /api/v1/courses/:id
export const deleteCourse = async (req, res) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: req.params.id }, select: { id: true, title: true } })
    await prisma.course.delete({ where: { id: req.params.id } })
    if (course) {
      await prisma.auditLog.create({
        data: {
          actor_id:    req.user.userId,
          action:      'course.deleted',
          entity_type: 'course',
          entity_id:   course.id,
          new_value:   { title: course.title },
        },
      }).catch(() => {})
    }
    return res.json({ success: true, message: 'Course deleted' })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: get all courses (including unpublished) ───────────
// GET /api/v1/courses/admin/all
export const adminGetAllCourses = async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        pricing_plans: { where: { active: true } },
        course_tutors: {
          include: {
            tutor: { select: { id: true, first_name: true, last_name: true, email: true } },
          },
        },
        _count: { select: { enrollments: true, sessions: true } },
      },
    })
    return res.json({ success: true, data: { courses } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: add module to course ─────────────────────────────
// POST /api/v1/courses/:id/modules
export const addModule = async (req, res) => {
  try {
    const { title, description, order_index, content_url, duration_minutes } = req.body
    if (!title || order_index === undefined) {
      return res.status(400).json({ success: false, error: 'title and order_index are required' })
    }

    const module = await prisma.courseModule.create({
      data: {
        course_id:        req.params.id,
        title,
        description:      description      || null,
        order_index,
        content_url:      content_url      || null,
        duration_minutes: duration_minutes || null,
        published:        false,
      },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:    req.user.userId,
        action:      'course_module.created',
        entity_type: 'course_module',
        entity_id:   module.id,
        new_value:   { title, course_id: req.params.id },
      },
    }).catch(() => {})

    return res.status(201).json({ success: true, data: { module } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: update module ─────────────────────────────────────
// PATCH /api/v1/courses/:id/modules/:moduleId
export const updateModule = async (req, res) => {
  try {
    const { title, description, order_index, content_url, duration_minutes, published } = req.body
    const module = await prisma.courseModule.update({
      where: { id: req.params.moduleId },
      data: {
        ...(title            !== undefined && { title }),
        ...(description      !== undefined && { description }),
        ...(order_index      !== undefined && { order_index }),
        ...(content_url      !== undefined && { content_url }),
        ...(duration_minutes !== undefined && { duration_minutes }),
        ...(published        !== undefined && { published }),
      },
    })
    await prisma.auditLog.create({
      data: {
        actor_id:    req.user.userId,
        action:      'course_module.updated',
        entity_type: 'course_module',
        entity_id:   module.id,
        new_value:   { title: module.title, course_id: req.params.id },
      },
    }).catch(() => {})
    return res.json({ success: true, data: { module } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: delete module ─────────────────────────────────────
// DELETE /api/v1/courses/:id/modules/:moduleId
export const deleteModule = async (req, res) => {
  try {
    const mod = await prisma.courseModule.findUnique({ where: { id: req.params.moduleId }, select: { id: true, title: true, course_id: true } })
    await prisma.courseModule.delete({ where: { id: req.params.moduleId } })
    if (mod) {
      await prisma.auditLog.create({
        data: {
          actor_id:    req.user.userId,
          action:      'course_module.deleted',
          entity_type: 'course_module',
          entity_id:   mod.id,
          new_value:   { title: mod.title, course_id: mod.course_id },
        },
      }).catch(() => {})
    }
    return res.json({ success: true, message: 'Module deleted' })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: add/update pricing plan ──────────────────────────
// POST /api/v1/courses/:id/pricing
export const upsertPricingPlan = async (req, res) => {
  try {
    const { plan_type, price_cents, currency, description, active } = req.body
    if (!plan_type || price_cents === undefined) {
      return res.status(400).json({ success: false, error: 'plan_type and price_cents are required' })
    }

    const plan = await prisma.pricingPlan.upsert({
      where:  { course_id_plan_type: { course_id: req.params.id, plan_type } },
      update: { price_cents, currency: currency || 'usd', description: description || null, active: active ?? true },
      create: {
        course_id:   req.params.id,
        plan_type,
        price_cents,
        currency:    currency    || 'usd',
        description: description || null,
        active:      active      ?? true,
      },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:    req.user.userId,
        action:      'pricing_plan.upserted',
        entity_type: 'pricing_plan',
        entity_id:   plan.id,
        new_value:   { course_id: req.params.id, plan_type, price_cents },
      },
    }).catch(() => {})

    return res.json({ success: true, data: { plan } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Get meeting links for a course ──────────────────────────
// GET /api/v1/courses/:id/meetings
// Protected — enrolled student, tutor, or admin
export const getCourseMeetings = async (req, res) => {
  try {
    const userId = req.user.userId
    const role   = req.user.role

    if (role === 'student') {
      const enrollment = await prisma.enrollment.findFirst({
        where: { student_id: userId, course_id: req.params.id, status: 'active' },
      })
      if (!enrollment) {
        return res.status(403).json({ success: false, error: 'You are not enrolled in this course' })
      }
    }

    const meetings = await prisma.courseMeetingLink.findMany({
      where:   { course_id: req.params.id },
      orderBy: { scheduled_at: 'desc' },
      include: {
        tutor: { select: { id: true, first_name: true, last_name: true } },
      },
    })

    return res.json({ success: true, data: { meetings } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Tutor: post a meeting link for a course ──────────────────
// POST /api/v1/courses/:id/meetings
// Protected — tutor assigned to this course
export const postTutorMeetingLink = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const { title, link, description, scheduled_at, recurring } = req.body

    if (!title || !link) {
      return res.status(400).json({ success: false, error: 'title and link are required' })
    }

    // Verify tutor is assigned to this course
    const courseTutor = await prisma.courseTutor.findUnique({
      where: { course_id_tutor_id: { course_id: req.params.id, tutor_id: tutorId } },
    })
    if (!courseTutor) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this course' })
    }

    const meeting = await prisma.courseMeetingLink.create({
      data: {
        course_id:    req.params.id,
        tutor_id:     tutorId,
        title,
        link,
        description:  description  || null,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
        recurring:    recurring    || false,
      },
    })

    // Notify enrolled students
    const enrollments = await prisma.enrollment.findMany({
      where:  { course_id: req.params.id, status: 'active' },
      select: { student_id: true },
    })
    if (enrollments.length > 0) {
      await prisma.notification.createMany({
        data: enrollments.map(e => ({
          user_id: e.student_id,
          title:   `New meeting: ${title}`,
          message: `Your tutor posted a new meeting link for your course.`,
          type:    'info',
          sent_by: tutorId,
        })),
      })
    }

    return res.status(201).json({ success: true, data: { meeting } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Student: get tutors for an enrolled course ───────────────
// GET /api/v1/courses/:id/tutors
// Protected — enrolled student or admin/tutor
export const getCourseTutors = async (req, res) => {
  try {
    const userId = req.user.userId
    const role   = req.user.role

    if (role === 'student') {
      const enrollment = await prisma.enrollment.findFirst({
        where: { student_id: userId, course_id: req.params.id, status: 'active' },
      })
      if (!enrollment) {
        return res.status(403).json({ success: false, error: 'You are not enrolled in this course' })
      }
    }

    const courseTutors = await prisma.courseTutor.findMany({
      where: { course_id: req.params.id },
      include: {
        tutor: {
          select: {
            id: true, first_name: true, last_name: true, avatar_url: true, bio: true, timezone: true,
            tutor_profile: {
              select: { rating: true, review_count: true, experience_years: true, specialisations: true },
            },
            availability: { orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }] },
          },
        },
      },
    })

    return res.json({ success: true, data: { tutors: courseTutors.map(ct => ct.tutor) } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}
