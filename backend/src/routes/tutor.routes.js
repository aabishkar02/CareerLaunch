import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import {
  getMyStudents,
  getTutorDashboard,
  getTutorCalendar,
  markBusy,
  removeBusySlot,
  postMeetingLink,
  deleteMeetingLink,
  getStudentDetail,
  clockIn,
  clockOut,
  getMyHours,
  getMyCourses,
  getMyAvailability,
  addAvailability,
  removeAvailability,
  getMyEarnings,
} from '../controllers/tutor.controller.js'
import {
  getMyBanking,
  updateMyBanking,
  getMyPayouts,
} from '../controllers/tutorBanking.controller.js'
import { getMyPayrollWeeks } from '../controllers/weeklyPayroll.controller.js'

const router = Router()
const tutorGuard = [protect, authorize('tutor')]
const adminGuard = [protect, authorize('admin')]

// ── Tutor own routes ─────────────────────────────────────────
router.get('/me/dashboard',           ...tutorGuard, getTutorDashboard)
router.get('/me/courses',             ...tutorGuard, getMyCourses)
router.get('/me/students',            ...tutorGuard, getMyStudents)
router.get('/me/students/:studentId', ...tutorGuard, getStudentDetail)
router.get('/me/calendar',            ...tutorGuard, getTutorCalendar)
router.post('/me/busy',               ...tutorGuard, markBusy)
router.delete('/me/busy/:id',         ...tutorGuard, removeBusySlot)
router.post('/me/meetings',           ...tutorGuard, postMeetingLink)
router.delete('/me/meetings/:id',     protect,       deleteMeetingLink) // tutor or admin
router.get('/me/availability',        ...tutorGuard, getMyAvailability)
router.post('/me/availability',       ...tutorGuard, addAvailability)
router.delete('/me/availability/:id', ...tutorGuard, removeAvailability)
router.post('/me/clock-in',           ...tutorGuard, clockIn)
router.post('/me/clock-out',          ...tutorGuard, clockOut)
router.get('/me/hours',               ...tutorGuard, getMyHours)
router.get('/me/earnings',            ...tutorGuard, getMyEarnings)
router.get('/me/payroll/my-weeks',    ...tutorGuard, getMyPayrollWeeks)
router.get('/me/banking',             ...tutorGuard, getMyBanking)
router.put('/me/banking',             ...tutorGuard, updateMyBanking)
router.get('/me/payouts',             ...tutorGuard, getMyPayouts)

// ── Public tutor profile (student can view) ──────────────────
router.get('/:id/calendar', protect, getTutorCalendar)

export default router