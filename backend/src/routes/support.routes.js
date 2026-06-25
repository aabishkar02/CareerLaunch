import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import {
  createTicket,
  getMyTickets,
  getTicketById,
  addMessage,
  adminGetTickets,
  adminGetTicketById,
  adminUpdateTicket,
  adminReplyToTicket,
} from '../controllers/support.controller.js'

const router = Router()
const studentGuard = [protect, authorize('student')]
const adminGuard   = [protect, authorize('admin')]

// ── Student routes ───────────────────────────────────────────
router.post('/',                    ...studentGuard, createTicket)
router.get('/',                     ...studentGuard, getMyTickets)
router.get('/:id',                  ...studentGuard, getTicketById)
router.post('/:id/messages',        ...studentGuard, addMessage)

// ── Admin routes ─────────────────────────────────────────────
router.get('/admin/all',            ...adminGuard, adminGetTickets)
router.get('/admin/:id',            ...adminGuard, adminGetTicketById)
router.patch('/admin/:id',          ...adminGuard, adminUpdateTicket)
router.post('/admin/:id/reply',     ...adminGuard, adminReplyToTicket)

export default router
