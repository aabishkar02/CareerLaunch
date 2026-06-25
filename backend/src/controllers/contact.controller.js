import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ─── Public: submit contact form ─────────────────────────────
export const submitContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, error: 'name, email, subject and message are required' })
    }

    const submission = await prisma.contactSubmission.create({
      data: { name, email, phone: phone || null, subject, message, status: 'new' },
    })
    return res.status(201).json({ success: true, data: { submission }, message: 'Message sent!' })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: list all submissions ─────────────────────────────
export const getContacts = async (req, res) => {
  try {
    const { status } = req.query
    const contacts = await prisma.contactSubmission.findMany({
      where:   status ? { status } : {},
      orderBy: { created_at: 'desc' },
    })
    return res.json({ success: true, data: { contacts } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: mark as read / replied ───────────────────────────
export const updateContactStatus = async (req, res) => {
  try {
    const { status } = req.body
    const contact = await prisma.contactSubmission.update({
      where: { id: req.params.id },
      data:  { status, replied_by: req.user.userId, replied_at: new Date() },
    })
    return res.json({ success: true, data: { contact } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: delete submission ─────────────────────────────────
export const deleteContact = async (req, res) => {
  try {
    await prisma.contactSubmission.delete({ where: { id: req.params.id } })
    return res.json({ success: true, message: 'Deleted' })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}
