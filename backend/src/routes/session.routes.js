import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import {
  requestSession,
  confirmSession,
  cancelSession,
  requestCancellation,
  completeSession,
  undoCompleteSession,
  getMySessions,
  getUpcomingSessions,
  getSessionById,
  getAvailableSlots,
  adminGetAllSessions,
  getTutorModuleStudents,
  updateSessionLink,
} from '../controllers/session.controller.js'

const router = Router()

// ── Public-ish (authenticated) ────────────────────────────────
router.get('/my',                protect,                        getMySessions)
router.get('/upcoming',          protect,                        getUpcomingSessions)
router.get('/available',         protect, authorize('student'),  getAvailableSlots)
router.get('/:id',               protect,                        getSessionById)

// ── Student actions ───────────────────────────────────────────
router.post('/request',               protect, authorize('student'),  requestSession)
router.patch('/:id/cancel',           protect,                        cancelSession)
router.post('/:id/cancel-request',    protect, authorize('student'),  requestCancellation)

// ── Tutor actions ─────────────────────────────────────────────
router.get('/tutor/module-students', protect, authorize('tutor'), getTutorModuleStudents)
router.patch('/:id/confirm',         protect, authorize('tutor'), confirmSession)
router.post('/:id/confirm',          protect, authorize('tutor'), confirmSession)  // POST alias
router.post('/:id/decline',          protect, authorize('tutor'), cancelSession)   // decline = cancel by tutor
router.patch('/:id/link',            protect, authorize('tutor'), updateSessionLink)
router.patch('/:id/complete',        protect, authorize('tutor'), completeSession)
router.patch('/:id/undo-complete',   protect, authorize('tutor'), undoCompleteSession)

// ── Admin ─────────────────────────────────────────────────────
router.get('/admin/all',         protect, authorize('admin'),    adminGetAllSessions)

export default router