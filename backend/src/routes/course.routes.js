import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import {
  getCourses,
  getCourseBySlug,
  createCourse,
  updateCourse,
  togglePublish,
  deleteCourse,
  adminGetAllCourses,
  addModule,
  updateModule,
  deleteModule,
  upsertPricingPlan,
  getCourseTutors,
  getCourseMeetings,
  postTutorMeetingLink,
} from '../controllers/course.controller.js'

const router = Router()
const admin  = [protect, authorize('admin')]

// ─── Public ───────────────────────────────────────────────────
router.get('/',      getCourses)
router.get('/:slug', getCourseBySlug)

// ─── Authenticated (enrolled student, tutor, or admin) ────────
router.get('/:id/tutors',   protect, getCourseTutors)
router.get('/:id/meetings', protect, getCourseMeetings)
router.post('/:id/meetings', protect, authorize('tutor'), postTutorMeetingLink)

// ─── Admin only ───────────────────────────────────────────────
router.get('/admin/all',                ...admin, adminGetAllCourses)
router.post('/',                        ...admin, createCourse)
router.patch('/:id',                    ...admin, updateCourse)
router.patch('/:id/publish',            ...admin, togglePublish)
router.delete('/:id',                   ...admin, deleteCourse)
router.post('/:id/modules',             ...admin, addModule)
router.patch('/:id/modules/:moduleId',  ...admin, updateModule)
router.delete('/:id/modules/:moduleId', ...admin, deleteModule)
router.post('/:id/pricing',             ...admin, upsertPricingPlan)

export default router
