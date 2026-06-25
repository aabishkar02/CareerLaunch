import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import {
  getMyEnrollments,
  getMySessions,
  getUpcomingSessions,
  getMyProgress,
  updateModuleProgress,
  getMyAssignments,
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getMyCertifications,
  selectTutor,
  getMyModuleEnrollments,
  selectTutorForModule,
} from '../controllers/student.controller.js'

const router = Router()

// All routes protected — student only unless noted
// Mounted at /api/v1/students

router.get('/me/enrollments',          protect, authorize('student'), getMyEnrollments)
router.get('/me/sessions',             protect, authorize('student'), getMySessions)
router.get('/me/sessions/upcoming',    protect, authorize('student'), getUpcomingSessions)
router.get('/me/progress',             protect, authorize('student'), getMyProgress)
router.patch('/me/progress/:moduleId', protect, authorize('student'), updateModuleProgress)
router.get('/me/assignments',          protect, authorize('student'), getMyAssignments)
router.get('/me/notifications',        protect, authorize('student'), getMyNotifications)
router.get('/me/certifications',       protect, authorize('student'), getMyCertifications)

router.post('/me/enrollments/:enrollmentId/select-tutor',     protect, authorize('student'), selectTutor)
router.get('/me/module-enrollments',                          protect, authorize('student'), getMyModuleEnrollments)
router.post('/me/module-enrollments/:id/select-tutor',        protect, authorize('student'), selectTutorForModule)

// Notification routes (shared — any role can use)
router.patch('/me/notifications/:id/read', protect, markNotificationRead)
router.patch('/me/notifications/read-all', protect, markAllNotificationsRead)

export default router