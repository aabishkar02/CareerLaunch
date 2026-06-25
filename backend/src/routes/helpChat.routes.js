import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import {
  startChat,
  getMyChat,
  sendMessage,
  adminGetQueue,
  adminGetHistory,
  adminClaimChat,
  adminGetChat,
  adminSendMessage,
  adminCloseChat,
} from '../controllers/helpChat.controller.js'

const router = Router()
const userGuard  = [protect, authorize('student', 'tutor')]
const adminGuard = [protect, authorize('admin')]

// ── Student / Tutor ──────────────────────────────────────────
router.post('/',              ...userGuard,  startChat)
router.get('/mine',           ...userGuard,  getMyChat)
router.post('/:id/messages',  ...userGuard,  sendMessage)

// ── Admin ────────────────────────────────────────────────────
router.get('/admin/queue',            ...adminGuard, adminGetQueue)
router.get('/admin/history',          ...adminGuard, adminGetHistory)
router.post('/admin/:id/claim',       ...adminGuard, adminClaimChat)
router.get('/admin/:id',              ...adminGuard, adminGetChat)
router.post('/admin/:id/messages',    ...adminGuard, adminSendMessage)
router.post('/admin/:id/close',       ...adminGuard, adminCloseChat)

export default router
