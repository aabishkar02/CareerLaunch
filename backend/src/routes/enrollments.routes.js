import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import {
  getMyEnrollments,
  getEnrollmentMaterials,
  getEnrollmentTutor,
  getEnrollmentTutors,
  getTeachingEnrollments,
} from '../controllers/enrollments.controller.js'

const router = Router()

// ── Student: own enrollments ──────────────────────────────────
// GET /api/v1/enrollments
router.get('/', protect, getMyEnrollments)

// ── Tutor: modules I'm teaching ──────────────────────────────
// GET /api/v1/enrollments/teaching
router.get('/teaching', protect, authorize('tutor', 'admin'), getTeachingEnrollments)

// ── Per-enrollment sub-resources ────────────────────────────
// GET /api/v1/enrollments/:id/materials
router.get('/:id/materials', protect, getEnrollmentMaterials)

// GET /api/v1/enrollments/:id/tutor
router.get('/:id/tutor', protect, getEnrollmentTutor)

// GET /api/v1/enrollments/:id/tutors
router.get('/:id/tutors', protect, getEnrollmentTutors)

export default router
