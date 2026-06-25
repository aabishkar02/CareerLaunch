import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import {
  sendNotification,
  getNotificationHistory,
  getMyNotifications,
  markRead,
  markAllRead,
} from '../controllers/notification.controller.js'

const router = Router()

// ── Any authenticated user ────────────────────────────────────
router.get('/me',           protect, getMyNotifications)
router.patch('/read-all',   protect, markAllRead)
router.patch('/:id/read',   protect, markRead)

// ── Admin or tutor can send ───────────────────────────────────
router.post('/send', protect, authorize('admin', 'tutor'), sendNotification)

// ── Admin only ────────────────────────────────────────────────
router.get('/history', protect, authorize('admin'), getNotificationHistory)

export default router