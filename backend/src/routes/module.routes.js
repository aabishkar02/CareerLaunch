import { Router } from 'express'
import { protect as authenticate, authorize } from '../middleware/auth.middleware.js'
const authorizeRoles = (...roles) => authorize(...roles)
import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

const router = Router()

// Resolve moduleId to a real CourseModule.id.
// Accepts either a CourseModule.id (direct) or a managed Module.id (resolved by name match).
async function resolveCourseModuleId(moduleId) {
  const cm = await prisma.courseModule.findUnique({ where: { id: moduleId }, select: { id: true } })
  if (cm) return moduleId

  const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { id: true, name: true } })
  if (mod) {
    const found = await prisma.courseModule.findFirst({
      where: { title: { contains: mod.name, mode: 'insensitive' } },
      select: { id: true },
    })
    return found?.id || null
  }
  return null
}

// ── GET /modules/:moduleId/questions — public for any authenticated user ──
router.get('/:moduleId/questions', authenticate, async (req, res) => {
  try {
    const questions = await prisma.moduleQuestion.findMany({
      where:   { module_id: req.params.moduleId },
      orderBy: { order_index: 'asc' },
    })
    res.json({ success: true, data: { questions } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── POST /modules/:moduleId/questions — admin only ──
router.post('/:moduleId/questions', authenticate, authorizeRoles('admin'), async (req, res) => {
  const { question, order_index = 0, required = false } = req.body
  if (!question) return res.status(400).json({ success: false, error: 'question is required' })
  try {
    const q = await prisma.moduleQuestion.create({
      data: { module_id: req.params.moduleId, question, order_index: Number(order_index), required: Boolean(required) },
    })
    res.json({ success: true, data: { question: q } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── PATCH /modules/:moduleId/questions/:id — admin only ──
router.patch('/:moduleId/questions/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  const { question, order_index, required } = req.body
  try {
    const q = await prisma.moduleQuestion.update({
      where: { id: req.params.id },
      data:  {
        ...(question    !== undefined && { question }),
        ...(order_index !== undefined && { order_index: Number(order_index) }),
        ...(required    !== undefined && { required: Boolean(required) }),
      },
    })
    res.json({ success: true, data: { question: q } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── DELETE /modules/:moduleId/questions/:id — admin only ──
router.delete('/:moduleId/questions/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  try {
    await prisma.moduleQuestion.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── POST /modules/:moduleId/questions/responses — student submits answers ──
router.post('/:moduleId/questions/responses', authenticate, authorizeRoles('student'), async (req, res) => {
  const { session_id, answers } = req.body
  if (!session_id || !Array.isArray(answers)) {
    return res.status(400).json({ success: false, error: 'session_id and answers array required' })
  }
  try {
    const created = await prisma.$transaction(
      answers.map(a => prisma.sessionQuestionnaire.upsert({
        where:  { session_id_question_id: { session_id, question_id: a.question_id } },
        create: { session_id, question_id: a.question_id, answer: a.answer },
        update: { answer: a.answer },
      }))
    )
    res.json({ success: true, data: { responses: created } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── GET /modules/:moduleId/questions/responses/:sessionId — tutor/admin ──
router.get('/:moduleId/questions/responses/:sessionId', authenticate, authorizeRoles('tutor', 'admin'), async (req, res) => {
  try {
    const responses = await prisma.sessionQuestionnaire.findMany({
      where:   { session_id: req.params.sessionId },
      include: { question: true },
      orderBy: { question: { order_index: 'asc' } },
    })
    res.json({ success: true, data: { responses } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── GET /modules/:moduleId/materials ──
// Accepts CourseModule.id or managed Module.id; resolves automatically.
router.get('/:moduleId/materials', authenticate, async (req, res) => {
  try {
    const { role } = req.user
    const resolvedId = await resolveCourseModuleId(req.params.moduleId)

    if (!resolvedId) {
      return res.json({ success: true, data: { materials: [] } })
    }

    const where = { module_id: resolvedId }
    if (role === 'student') where.type = { in: ['student', 'all'] }
    else if (role === 'tutor') where.type = { in: ['tutor', 'all'] }

    const materials = await prisma.moduleMaterial.findMany({
      where,
      orderBy: [{ order_index: 'asc' }, { created_at: 'asc' }],
    })
    res.json({ success: true, data: { materials } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── POST /modules/:moduleId/materials — admin only ──
// Accepts CourseModule.id or managed Module.id; resolves automatically.
router.post('/:moduleId/materials', authenticate, authorizeRoles('admin'), async (req, res) => {
  const { title, url, description, file_type, type = 'student', order_index = 0 } = req.body
  if (!title || !url) return res.status(400).json({ success: false, error: 'title and url required' })
  try {
    const resolvedId = await resolveCourseModuleId(req.params.moduleId)
    if (!resolvedId) return res.status(404).json({ success: false, error: 'Module not found' })

    const m = await prisma.moduleMaterial.create({
      data: { module_id: resolvedId, title, url, description, file_type, type, order_index: Number(order_index) },
    })
    res.json({ success: true, data: { material: m } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── PATCH /modules/:moduleId/materials/:id — admin only ──
router.patch('/:moduleId/materials/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  const { title, url, description, file_type, type, order_index } = req.body
  try {
    const m = await prisma.moduleMaterial.update({
      where: { id: req.params.id },
      data:  {
        ...(title       !== undefined && { title }),
        ...(url         !== undefined && { url }),
        ...(description !== undefined && { description }),
        ...(file_type   !== undefined && { file_type }),
        ...(type        !== undefined && { type }),
        ...(order_index !== undefined && { order_index: Number(order_index) }),
      },
    })
    res.json({ success: true, data: { material: m } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── DELETE /modules/:moduleId/materials/:id — admin only ──
router.delete('/:moduleId/materials/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  try {
    await prisma.moduleMaterial.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

export default router
