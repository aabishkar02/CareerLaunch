import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import {
  submitOnboardingRequest,
  getMyOnboardingRequest,
  getTutorsForOnboarding,
  adminGetOnboardingRequests,
  adminAssignTutorAndOnboard,
  adminSendOnboardingMessage,
  getTutorProfile,
  getMyTutorProfile,
  updateTutorProfile,
  rateTutor,
} from '../controllers/onboarding.controller.js'

const router = Router()

// ── Public browsing ───────────────────────────────────────────
router.get('/tutors',               protect, getTutorsForOnboarding)
router.get('/tutors/me/profile',    protect, authorize('tutor'), getMyTutorProfile)
router.get('/tutors/:id',           protect, getTutorProfile)

// ── Student ───────────────────────────────────────────────────
router.post('/request',             protect, authorize('student'), submitOnboardingRequest)
router.get('/my',                   protect, authorize('student'), getMyOnboardingRequest)
router.post('/tutors/:id/review',   protect, authorize('student'), rateTutor)

// ── Tutor ─────────────────────────────────────────────────────
router.put('/tutors/me/profile',    protect, authorize('tutor'), updateTutorProfile)

// ── Admin ─────────────────────────────────────────────────────
router.get('/admin/requests',   protect, authorize('admin'), adminGetOnboardingRequests)
router.post('/admin/assign',    protect, authorize('admin'), adminAssignTutorAndOnboard)
router.post('/admin/message',   protect, authorize('admin'), adminSendOnboardingMessage)

export default router