import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ─── STUDENT: Create ticket ───────────────────────────────────
// POST /api/v1/support/tickets
// Map human-readable frontend category labels → DB enum values
const CATEGORY_MAP = {
  'Scheduling':          'scheduling_issue',
  'Payments & credits':  'payment_issue',
  'Technical':           'general_support',
  'Mentor feedback':     'session_complaint',
  'Other':               'other',
  'Refund':              'refund_request',
  'Tutor change':        'tutor_change',
}

export const createTicket = async (req, res) => {
  try {
    const studentId = req.user.userId
    // Accept `subject` as an alias for `title` (frontend sends `subject`)
    const {
      title: rawTitle, subject, category: rawCategory,
      priority, message,
      related_payment_id, related_session_id, related_tutor_id,
    } = req.body

    const title    = rawTitle || subject
    // Normalize frontend label → enum value
    const category = CATEGORY_MAP[rawCategory] || rawCategory || 'other'

    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'title/subject and message are required' })
    }

    const VALID_CATEGORIES = ['refund_request','tutor_change','scheduling_issue','payment_issue','session_complaint','general_support','other']
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` })
    }

    // Verify linked entities belong to this student
    if (related_payment_id) {
      const payment = await prisma.payment.findFirst({ where: { id: related_payment_id, student_id: studentId } })
      if (!payment) return res.status(400).json({ success: false, error: 'Payment not found or does not belong to you' })
    }
    if (related_session_id) {
      const session = await prisma.session.findFirst({ where: { id: related_session_id, student_id: studentId } })
      if (!session) return res.status(400).json({ success: false, error: 'Session not found or does not belong to you' })
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        student_id:         studentId,
        title,
        category,
        priority:           priority || 'normal',
        status:             'open',
        related_payment_id: related_payment_id || null,
        related_session_id: related_session_id || null,
        related_tutor_id:   related_tutor_id   || null,
        messages: {
          create: {
            sender_id:   studentId,
            content:     message,
            is_internal: false,
          },
        },
      },
      include: {
        messages: { include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } } },
      },
    })

    // Notify all admins
    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } })
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map(a => ({
          user_id: a.id,
          title:   `New support ticket: ${title}`,
          message: `A student has opened a support ticket (${category.replace(/_/g,' ')}). Ticket #${ticket.id.slice(0,8).toUpperCase()}`,
          type:    'info',
          sent_by: studentId,
        })),
      })
    }

    return res.status(201).json({ success: true, data: { ticket } })
  } catch (e) {
    console.error('Create ticket error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── STUDENT: My tickets ──────────────────────────────────────
// GET /api/v1/support/tickets
export const getMyTickets = async (req, res) => {
  try {
    const studentId = req.user.userId
    const { status, category } = req.query

    const where = { student_id: studentId }
    if (status)   where.status   = status
    if (category) where.category = category

    const tickets = await prisma.supportTicket.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        _count:  { select: { messages: true } },
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } },
        },
        related_payment: { select: { id: true, amount_cents: true, status: true, plan: { select: { plan_type: true } } } },
        related_session: { select: { id: true, subject: true, scheduled_date: true } },
      },
    })

    // Add `subject` alias and `last_reply` field for frontend compatibility
    const enriched = tickets.map(t => {
      const adminMessage = t.messages.find(m => m.sender?.role !== 'student')
      return {
        ...t,
        subject:    t.title,
        last_reply: adminMessage?.content || null,
      }
    })

    return res.json({ success: true, data: { tickets: enriched } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── STUDENT: Ticket detail ───────────────────────────────────
// GET /api/v1/support/tickets/:id
export const getTicketById = async (req, res) => {
  try {
    const studentId = req.user.userId
    const { id }    = req.params

    const ticket = await prisma.supportTicket.findFirst({
      where: { id, student_id: studentId },
      include: {
        messages: {
          where:   { is_internal: false },
          orderBy: { created_at: 'asc' },
          include: { sender: { select: { id: true, first_name: true, last_name: true, role: true, avatar_url: true } } },
        },
        assigned_admin:  { select: { id: true, first_name: true, last_name: true } },
        related_payment: { select: { id: true, amount_cents: true, status: true, created_at: true, plan: { select: { plan_type: true } } } },
        related_session: { select: { id: true, subject: true, scheduled_date: true, start_time: true, end_time: true } },
      },
    })

    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' })

    return res.json({ success: true, data: { ticket } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── STUDENT: Add message to ticket ──────────────────────────
// POST /api/v1/support/tickets/:id/messages
export const addMessage = async (req, res) => {
  try {
    const studentId = req.user.userId
    const { id }    = req.params
    const { content } = req.body

    if (!content?.trim()) return res.status(400).json({ success: false, error: 'Message content is required' })

    const ticket = await prisma.supportTicket.findFirst({ where: { id, student_id: studentId } })
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' })
    if (ticket.status === 'closed') return res.status(400).json({ success: false, error: 'Cannot add messages to a closed ticket' })

    const message = await prisma.supportMessage.create({
      data: { ticket_id: id, sender_id: studentId, content, is_internal: false },
      include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } },
    })

    // Reopen ticket if it was resolved
    if (ticket.status === 'resolved') {
      await prisma.supportTicket.update({ where: { id }, data: { status: 'open', updated_at: new Date() } })
    } else {
      await prisma.supportTicket.update({ where: { id }, data: { updated_at: new Date() } })
    }

    // Notify assigned admin
    if (ticket.assigned_admin_id) {
      await prisma.notification.create({
        data: {
          user_id: ticket.assigned_admin_id,
          title:   'New message on support ticket',
          message: `A student has replied on ticket: ${ticket.title}`,
          type:    'info',
          sent_by: studentId,
        },
      })
    }

    return res.status(201).json({ success: true, data: { message } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Get all tickets ───────────────────────────────────
// GET /api/v1/admin/support/tickets
export const adminGetTickets = async (req, res) => {
  try {
    const { status, category, priority, studentId, search, page = 1, limit = 30 } = req.query

    const where = {}
    if (status)    where.status    = status
    if (category)  where.category  = category
    if (priority)  where.priority  = priority
    if (studentId) where.student_id = studentId
    if (search) {
      where.OR = [
        { title:   { contains: search, mode: 'insensitive' } },
        { student: { email: { contains: search, mode: 'insensitive' } } },
        { student: { first_name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
        skip:  (parseInt(page) - 1) * parseInt(limit),
        take:  parseInt(limit),
        include: {
          student:       { select: { id: true, first_name: true, last_name: true, email: true } },
          assigned_admin:{ select: { id: true, first_name: true, last_name: true } },
          _count:        { select: { messages: true } },
          messages: {
            orderBy: { created_at: 'desc' },
            take: 1,
            include: { sender: { select: { first_name: true, last_name: true, role: true } } },
          },
          related_payment: { select: { id: true, amount_cents: true, status: true, plan: { select: { plan_type: true } } } },
        },
      }),
      prisma.supportTicket.count({ where }),
    ])

    // Status summary counts
    const counts = await prisma.supportTicket.groupBy({
      by:    ['status'],
      _count: { status: true },
    })
    const statusCounts = {}
    counts.forEach(c => { statusCounts[c.status] = c._count.status })

    return res.json({ success: true, data: { tickets, total, page: parseInt(page), status_counts: statusCounts } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Get single ticket with all messages ───────────────
// GET /api/v1/admin/support/tickets/:id
export const adminGetTicketById = async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: {
        student:       { select: { id: true, first_name: true, last_name: true, email: true, avatar_url: true } },
        assigned_admin:{ select: { id: true, first_name: true, last_name: true } },
        messages: {
          orderBy: { created_at: 'asc' },
          include: { sender: { select: { id: true, first_name: true, last_name: true, role: true, avatar_url: true } } },
        },
        related_payment: {
          include: { plan: { select: { plan_type: true } } },
        },
        related_session: { select: { id: true, subject: true, scheduled_date: true, start_time: true, end_time: true, status: true } },
      },
    })
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' })
    return res.json({ success: true, data: { ticket } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Update ticket (status, priority, assignment) ─────
// PATCH /api/v1/admin/support/tickets/:id
export const adminUpdateTicket = async (req, res) => {
  try {
    const { status, priority, assigned_admin_id } = req.body
    const { id } = req.params

    const data = { updated_at: new Date() }
    if (status)             data.status             = status
    if (priority)           data.priority           = priority
    if (assigned_admin_id !== undefined) data.assigned_admin_id = assigned_admin_id || null
    if (status === 'resolved' || status === 'closed') data.resolved_at = new Date()

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data,
      include: { student: { select: { id: true, first_name: true, last_name: true } } },
    })

    // Notify student of status change
    if (status && ['resolved','closed'].includes(status)) {
      await prisma.notification.create({
        data: {
          user_id: ticket.student_id,
          title:   `Support ticket ${status}`,
          message: `Your support ticket "${ticket.title}" has been marked as ${status}.`,
          type:    'info',
          sent_by: req.user.userId,
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: ticket.student_id,
        action:         'support_ticket.updated',
        entity_type:    'support_ticket',
        entity_id:      id,
        new_value:      data,
      },
    })

    return res.json({ success: true, data: { ticket } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Reply to ticket ───────────────────────────────────
// POST /api/v1/admin/support/tickets/:id/reply
export const adminReplyToTicket = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { id }  = req.params
    const { content, is_internal = false, new_status } = req.body

    if (!content?.trim()) return res.status(400).json({ success: false, error: 'Reply content is required' })

    const ticket = await prisma.supportTicket.findUnique({ where: { id } })
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' })

    const updateData = {
      updated_at:        new Date(),
      assigned_admin_id: ticket.assigned_admin_id || adminId,
    }
    if (new_status) {
      updateData.status = new_status
      if (['resolved','closed'].includes(new_status)) updateData.resolved_at = new Date()
    } else if (ticket.status === 'open') {
      updateData.status = 'in_review'
    }

    const [message] = await Promise.all([
      prisma.supportMessage.create({
        data: { ticket_id: id, sender_id: adminId, content, is_internal },
        include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } },
      }),
      prisma.supportTicket.update({ where: { id }, data: updateData }),
    ])

    // Notify student (only for non-internal messages)
    if (!is_internal) {
      const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { first_name: true, last_name: true } })
      await prisma.notification.create({
        data: {
          user_id: ticket.student_id,
          title:   'Admin replied to your ticket',
          message: `${admin.first_name} ${admin.last_name} replied to your support ticket: "${ticket.title}"`,
          type:    'info',
          sent_by: adminId,
        },
      })
    }

    return res.status(201).json({ success: true, data: { message, new_status: updateData.status } })
  } catch (e) {
    console.error('Admin reply error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}
