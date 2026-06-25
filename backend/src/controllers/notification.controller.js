import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ─── Send notification (admin or tutor) ──────────────────────
// POST /api/v1/notifications/send
// Body: { title, message, type, target: 'all'|'students'|'tutors'|userId }
export const sendNotification = async (req, res) => {
  try {
    const senderId = req.user.userId
    const { title, message, type = 'info', target, send_email = false } = req.body

    if (!title || !message || !target) {
      return res.status(400).json({
        success: false,
        error:   'title, message and target are required',
      })
    }

    let recipients = []

    if (target === 'all') {
      // Everyone except sender
      recipients = await prisma.user.findMany({
        where:  { id: { not: senderId }, suspended: false },
        select: { id: true },
      })
    } else if (target === 'students') {
      recipients = await prisma.user.findMany({
        where:  { role: 'student', suspended: false },
        select: { id: true },
      })
    } else if (target === 'tutors') {
      recipients = await prisma.user.findMany({
        where:  { role: 'tutor', suspended: false },
        select: { id: true },
      })
    } else {
      // Specific user ID
      const user = await prisma.user.findUnique({ where: { id: target } })
      if (!user) {
        return res.status(404).json({ success: false, error: 'Target user not found' })
      }
      recipients = [{ id: target }]
    }

    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No recipients found' })
    }

    // Create notification for each recipient
    await prisma.notification.createMany({
      data: recipients.map(r => ({
        user_id:    r.id,
        title,
        message,
        type,
        sent_by:    senderId,
        email_sent: send_email,
      })),
    })

    // Audit log for admin broadcasts
    if (req.user.role === 'admin') {
      await prisma.auditLog.create({
        data: {
          actor_id:    senderId,
          action:      'notification.broadcast',
          entity_type: 'notification',
          new_value:   { target, title, recipient_count: recipients.length },
        },
      })
    }

    return res.status(201).json({
      success: true,
      message: `Notification sent to ${recipients.length} recipient(s)`,
      data:    { sent_count: recipients.length },
    })
  } catch (error) {
    console.error('Send notification error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get notification history (admin) ────────────────────────
// GET /api/v1/notifications/history
export const getNotificationHistory = async (req, res) => {
  try {
    // Get distinct sent notifications (grouped by title + sender)
    const sent = await prisma.notification.findMany({
      where:   { sent_by: { not: null } },
      orderBy: { created_at: 'desc' },
      take:    100,
      distinct: ['title', 'sent_by'],
      include: {
        sender: { select: { id: true, first_name: true, last_name: true, role: true } },
      },
    })

    return res.status(200).json({
      success: true,
      data:    { notifications: sent },
    })
  } catch (error) {
    console.error('Notification history error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Get my notifications ─────────────────────────────────────
// GET /api/v1/notifications/me
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.userId

    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where:   { user_id: userId },
        orderBy: { created_at: 'desc' },
        take:    50,
        include: {
          sender: { select: { id: true, first_name: true, last_name: true, role: true } },
        },
      }),
      prisma.notification.count({ where: { user_id: userId, read: false } }),
    ])

    return res.status(200).json({
      success: true,
      data:    { notifications, unread_count: unread },
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Mark as read ─────────────────────────────────────────────
// PATCH /api/v1/notifications/:id/read
export const markRead = async (req, res) => {
  try {
    const userId = req.user.userId
    await prisma.notification.updateMany({
      where: { id: req.params.id, user_id: userId },
      data:  { read: true, read_at: new Date() },
    })
    return res.status(200).json({ success: true })
  } catch (error) {
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Mark all read ────────────────────────────────────────────
// PATCH /api/v1/notifications/read-all
export const markAllRead = async (req, res) => {
  try {
    const userId = req.user.userId
    await prisma.notification.updateMany({
      where: { user_id: userId, read: false },
      data:  { read: true, read_at: new Date() },
    })
    return res.status(200).json({ success: true, message: 'All marked as read' })
  } catch (error) {
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}