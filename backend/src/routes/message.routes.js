import { Router } from 'express'
import { protect } from '../middleware/auth.middleware.js'
import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

const router = Router()

// ── GET /messages/conversations — list my conversations
router.get('/conversations', protect, async (req, res) => {
  try {
    const userId = req.user.userId

    const memberships = await prisma.conversationParticipant.findMany({
      where: { user_id: userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, first_name: true, last_name: true, role: true, username: true } },
              },
            },
            messages: {
              where:   { deleted_at: null },
              orderBy: { sent_at: 'desc' },
              take:    1,
            },
          },
        },
      },
      orderBy: { conversation: { last_message_at: 'desc' } },
    })

    const conversations = memberships.map(m => {
      const convo  = m.conversation
      const others = convo.participants.filter(p => p.user_id !== userId).map(p => p.user)
      const last   = convo.messages[0] || null
      return {
        id:                convo.id,
        type:              convo.type,
        other_participant: others[0] || null,
        last_message:      last ? { content: last.content, sent_at: last.sent_at } : null,
        last_message_at:   convo.last_message_at,
        unread: last && m.last_read_at ? new Date(last.sent_at) > new Date(m.last_read_at) : !!last,
      }
    })

    res.json({ success: true, data: { conversations } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── POST /messages/conversations — get or create a direct conversation
router.post('/conversations', protect, async (req, res) => {
  try {
    const userId = req.user.userId
    const { user_id } = req.body
    if (!user_id) return res.status(400).json({ success: false, error: 'user_id is required' })
    if (user_id === userId) return res.status(400).json({ success: false, error: 'Cannot message yourself' })

    // Find existing direct conversation shared by both users
    const mine   = await prisma.conversationParticipant.findMany({ where: { user_id: userId },  select: { conversation_id: true } })
    const theirs = await prisma.conversationParticipant.findMany({ where: { user_id: user_id }, select: { conversation_id: true } })
    const myIds    = new Set(mine.map(p => p.conversation_id))
    const sharedId = theirs.find(p => myIds.has(p.conversation_id))?.conversation_id

    if (sharedId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: sharedId, type: 'direct' },
        include: {
          participants: {
            include: { user: { select: { id: true, first_name: true, last_name: true, role: true, username: true } } },
          },
        },
      })
      if (existing) return res.json({ success: true, data: { conversation: existing } })
    }

    // Verify the other user exists
    const other = await prisma.user.findUnique({
      where:  { id: user_id },
      select: { id: true, first_name: true, last_name: true, role: true },
    })
    if (!other) return res.status(404).json({ success: false, error: 'User not found' })

    const convo = await prisma.conversation.create({
      data: {
        type:       'direct',
        created_by: userId,
        participants: {
          create: [{ user_id: userId }, { user_id: user_id }],
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, first_name: true, last_name: true, role: true, username: true } } },
        },
      },
    })

    res.status(201).json({ success: true, data: { conversation: convo } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── GET /messages/conversations/:id — fetch messages in a conversation
router.get('/conversations/:id', protect, async (req, res) => {
  try {
    const userId  = req.user.userId
    const convoId = req.params.id

    const membership = await prisma.conversationParticipant.findFirst({
      where: { conversation_id: convoId, user_id: userId },
    })
    if (!membership) return res.status(403).json({ success: false, error: 'Not a participant' })

    const [convo, messages] = await Promise.all([
      prisma.conversation.findUnique({
        where:   { id: convoId },
        include: {
          participants: {
            include: { user: { select: { id: true, first_name: true, last_name: true, role: true, username: true } } },
          },
        },
      }),
      prisma.message.findMany({
        where:   { conversation_id: convoId, deleted_at: null },
        include: { sender: { select: { id: true, first_name: true, last_name: true, role: true, username: true } } },
        orderBy: { sent_at: 'asc' },
        take:    200,
      }),
    ])

    // Mark read
    await prisma.conversationParticipant.update({
      where: { id: membership.id },
      data:  { last_read_at: new Date() },
    })

    res.json({ success: true, data: { conversation: convo, messages } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── POST /messages/conversations/:id/messages — send a message
router.post('/conversations/:id/messages', protect, async (req, res) => {
  try {
    const userId  = req.user.userId
    const convoId = req.params.id
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ success: false, error: 'content is required' })

    const membership = await prisma.conversationParticipant.findFirst({
      where: { conversation_id: convoId, user_id: userId },
    })
    if (!membership) return res.status(403).json({ success: false, error: 'Not a participant' })

    const now = new Date()
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversation_id: convoId,
          sender_id:       userId,
          content:         content.trim(),
          message_type:    'text',
        },
        include: { sender: { select: { id: true, first_name: true, last_name: true, role: true, username: true } } },
      }),
      prisma.conversation.update({
        where: { id: convoId },
        data:  { last_message_at: now },
      }),
      prisma.conversationParticipant.update({
        where: { id: membership.id },
        data:  { last_read_at: now },
      }),
    ])

    res.status(201).json({ success: true, data: { message } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

export default router
