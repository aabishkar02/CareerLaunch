import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ─── Public: list published FAQs ─────────────────────────────
export const getFaqs = async (req, res) => {
  try {
    const faqs = await prisma.faq.findMany({
      where:   { published: true },
      orderBy: { order_index: 'asc' },
      select:  { id: true, question: true, answer: true, order_index: true },
    })
    return res.json({ success: true, data: { faqs } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: list all FAQs ─────────────────────────────────────
export const adminGetFaqs = async (req, res) => {
  try {
    const faqs = await prisma.faq.findMany({ orderBy: { order_index: 'asc' } })
    return res.json({ success: true, data: { faqs } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: create FAQ ────────────────────────────────────────
export const createFaq = async (req, res) => {
  try {
    const { question, answer, order_index, published } = req.body
    if (!question || !answer) return res.status(400).json({ success: false, error: 'question and answer are required' })

    const count = await prisma.faq.count()
    const faq = await prisma.faq.create({
      data: {
        question,
        answer,
        order_index: order_index ?? count + 1,
        published:   published ?? false,
        created_by:  req.user.userId,
      },
    })
    return res.status(201).json({ success: true, data: { faq } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: update FAQ ────────────────────────────────────────
export const updateFaq = async (req, res) => {
  try {
    const { question, answer, order_index, published } = req.body
    const faq = await prisma.faq.update({
      where: { id: req.params.id },
      data: {
        ...(question     !== undefined && { question }),
        ...(answer       !== undefined && { answer }),
        ...(order_index  !== undefined && { order_index }),
        ...(published    !== undefined && { published }),
      },
    })
    return res.json({ success: true, data: { faq } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Admin: delete FAQ ────────────────────────────────────────
export const deleteFaq = async (req, res) => {
  try {
    await prisma.faq.delete({ where: { id: req.params.id } })
    return res.json({ success: true, message: 'FAQ deleted' })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}
