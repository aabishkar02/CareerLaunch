import { prisma } from '../config/db.js'
import { getIO } from '../config/socket.js'
import { resetTimer, clearTimer } from '../services/helpChatTimers.js'
import { safeError } from '../utils/prodError.js'

const HIDE_AFTER_MS = 30 * 60 * 1000 // 30 min after close, hide from requester

// ─── USER: Start a help chat ──────────────────────────────────────
// POST /api/v1/help-chat
export const startChat = async (req, res) => {
  try {
    const requesterId = req.user.userId
    const { subject } = req.body

    // Prevent duplicate active/waiting chats
    const existing = await prisma.helpChat.findFirst({
      where: { requester_id: requesterId, status: { in: ['waiting', 'active'] } },
    })
    if (existing) {
      return res.status(409).json({ success: false, error: 'You already have an active help chat.' })
    }

    const chat = await prisma.helpChat.create({
      data: { requester_id: requesterId, subject: subject?.trim() || null },
      include: {
        requester: { select: { id: true, first_name: true, last_name: true, role: true } },
      },
    })

    // Notify all connected admins
    getIO().to('admin').emit('helpChat:new_request', { chat })

    return res.status(201).json({ success: true, data: { chat } })
  } catch (e) {
    console.error('startChat error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── USER: Get my current/recent chat ────────────────────────────
// GET /api/v1/help-chat/mine
export const getMyChat = async (req, res) => {
  try {
    const requesterId = req.user.userId
    const hideThreshold = new Date(Date.now() - HIDE_AFTER_MS)

    const chat = await prisma.helpChat.findFirst({
      where: {
        requester_id: requesterId,
        OR: [
          { status: { in: ['waiting', 'active'] } },
          { status: 'closed', closed_at: { gte: hideThreshold } },
        ],
      },
      orderBy: { created_at: 'desc' },
      include: {
        admin: { select: { id: true, first_name: true, last_name: true } },
        messages: {
          orderBy: { sent_at: 'asc' },
          include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } },
        },
      },
    })

    return res.json({ success: true, data: { chat } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── USER: Send a message ─────────────────────────────────────────
// POST /api/v1/help-chat/:id/messages
export const sendMessage = async (req, res) => {
  try {
    const userId = req.user.userId
    const { id } = req.params
    const { content } = req.body

    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty' })
    }

    const chat = await prisma.helpChat.findFirst({
      where: { id, requester_id: userId },
    })
    if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' })
    if (chat.status === 'closed') {
      return res.status(400).json({ success: false, error: 'This chat is closed' })
    }

    const [message] = await Promise.all([
      prisma.helpChatMessage.create({
        data: { chat_id: id, sender_id: userId, content: content.trim() },
        include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } },
      }),
      prisma.helpChat.update({ where: { id }, data: { last_message_at: new Date(), updated_at: new Date() } }),
    ])

    if (chat.status === 'active') resetTimer(id)

    if (chat.admin_id) {
      getIO().to(chat.admin_id).emit('helpChat:message', { chatId: id, message })
    }

    return res.status(201).json({ success: true, data: { message } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Get waiting queue ─────────────────────────────────────
// GET /api/v1/help-chat/admin/queue
export const adminGetQueue = async (req, res) => {
  try {
    const chats = await prisma.helpChat.findMany({
      where: { status: 'waiting' },
      orderBy: { created_at: 'asc' },
      include: {
        requester: { select: { id: true, first_name: true, last_name: true, role: true, email: true } },
      },
    })
    return res.json({ success: true, data: { chats } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Get all chats history ─────────────────────────────────
// GET /api/v1/help-chat/admin/history
export const adminGetHistory = async (req, res) => {
  try {
    const { status } = req.query
    const where = {}
    if (status) where.status = status

    const chats = await prisma.helpChat.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 100,
      include: {
        requester: { select: { id: true, first_name: true, last_name: true, role: true, email: true } },
        admin:     { select: { id: true, first_name: true, last_name: true } },
        _count:    { select: { messages: true } },
      },
    })

    return res.json({ success: true, data: { chats } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Claim a waiting chat (first-come-first-served) ────────
// POST /api/v1/help-chat/admin/:id/claim
export const adminClaimChat = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { id } = req.params

    let chat
    try {
      chat = await prisma.$transaction(async (tx) => {
        const existing = await tx.helpChat.findFirst({ where: { id, status: 'waiting' } })
        if (!existing) throw new Error('ALREADY_CLAIMED')

        return tx.helpChat.update({
          where: { id },
          data: { admin_id: adminId, status: 'active', claimed_at: new Date(), updated_at: new Date() },
          include: {
            requester: { select: { id: true, first_name: true, last_name: true, role: true } },
            admin:     { select: { id: true, first_name: true, last_name: true } },
            messages: {
              orderBy: { sent_at: 'asc' },
              include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } },
            },
          },
        })
      })
    } catch (e) {
      if (e.message === 'ALREADY_CLAIMED') {
        return res.status(409).json({ success: false, error: 'This chat has already been claimed by another admin.' })
      }
      throw e
    }

    resetTimer(id)

    // Tell the requester an admin has joined
    getIO().to(chat.requester_id).emit('helpChat:claimed', {
      chatId: id,
      admin: chat.admin,
    })

    // Remove from all admins' queues
    getIO().to('admin').emit('helpChat:queue_update', { chatId: id, action: 'claimed', adminId })

    return res.json({ success: true, data: { chat } })
  } catch (e) {
    console.error('adminClaimChat error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Get single chat (with messages) ────────────────────────
// GET /api/v1/help-chat/admin/:id
export const adminGetChat = async (req, res) => {
  try {
    const chat = await prisma.helpChat.findUnique({
      where: { id: req.params.id },
      include: {
        requester: { select: { id: true, first_name: true, last_name: true, role: true, email: true } },
        admin:     { select: { id: true, first_name: true, last_name: true } },
        messages: {
          orderBy: { sent_at: 'asc' },
          include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } },
        },
      },
    })
    if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' })
    return res.json({ success: true, data: { chat } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Send a message ─────────────────────────────────────────
// POST /api/v1/help-chat/admin/:id/messages
export const adminSendMessage = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { id } = req.params
    const { content } = req.body

    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty' })
    }

    const chat = await prisma.helpChat.findFirst({
      where: { id, admin_id: adminId, status: 'active' },
    })
    if (!chat) return res.status(404).json({ success: false, error: 'Active chat not found' })

    const [message] = await Promise.all([
      prisma.helpChatMessage.create({
        data: { chat_id: id, sender_id: adminId, content: content.trim() },
        include: { sender: { select: { id: true, first_name: true, last_name: true, role: true } } },
      }),
      prisma.helpChat.update({ where: { id }, data: { last_message_at: new Date(), updated_at: new Date() } }),
    ])

    resetTimer(id)

    getIO().to(chat.requester_id).emit('helpChat:message', { chatId: id, message })

    return res.status(201).json({ success: true, data: { message } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── ADMIN: Close a chat ───────────────────────────────────────────
// POST /api/v1/help-chat/admin/:id/close
export const adminCloseChat = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { id } = req.params

    const existing = await prisma.helpChat.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ success: false, error: 'Chat not found' })
    if (existing.status === 'closed') {
      return res.status(400).json({ success: false, error: 'Chat is already closed' })
    }

    clearTimer(id)

    await prisma.helpChat.update({
      where: { id },
      data: { status: 'closed', closed_at: new Date(), closed_by: adminId, updated_at: new Date() },
    })

    getIO().to(existing.requester_id).emit('helpChat:closed', { chatId: id, reason: 'admin' })
    if (existing.admin_id) {
      getIO().to(existing.admin_id).emit('helpChat:closed', { chatId: id, reason: 'admin' })
    }

    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}
