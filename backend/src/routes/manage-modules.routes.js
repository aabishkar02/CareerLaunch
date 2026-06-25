import { Router } from 'express'
import { protect as auth, authorize } from '../middleware/auth.middleware.js'
import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

const router = Router()
const admin  = [auth, authorize('admin')]

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function logAction(actorId, action, entityId, entityName, oldVal, newVal) {
  await prisma.auditLog.create({
    data: {
      actor_id:    actorId,
      action,
      entity_type: 'module',
      entity_id:   entityId,
      old_value:   oldVal || undefined,
      new_value:   newVal || { name: entityName },
    },
  }).catch(() => {})
}

// ── GET /admin/manage/modules  — list all (with optional filters) ──
router.get('/', ...admin, async (req, res) => {
  try {
    const { status, visibility, q } = req.query
    const where = {}
    if (status && status !== 'all') where.status     = status
    if (visibility)                 where.visibility = visibility
    if (q)                          where.name       = { contains: q, mode: 'insensitive' }

    const modules = await prisma.module.findMany({
      where,
      orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
      include: {
        _count:      { select: { plan_modules: true } },
        plan_modules: {
          select: { plan: { select: { id: true, name: true } } },
        },
      },
    })
    res.json({ success: true, data: { modules } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── POST /admin/manage/modules  — create ──
router.post('/', ...admin, async (req, res) => {
  const { name, short_description, full_description, thumbnail_url, credit_cost = 1,
          cert_sessions_required, category, status = 'unpublished', visibility = 'hidden', display_order = 0 } = req.body

  if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' })

  try {
    let slug = slugify(name)
    const existing = await prisma.module.findUnique({ where: { slug } })
    if (existing) slug = `${slug}-${Date.now()}`

    const module = await prisma.module.create({
      data: { name: name.trim(), slug, short_description, full_description, thumbnail_url,
              credit_cost: Number(credit_cost),
              cert_sessions_required: cert_sessions_required != null ? Number(cert_sessions_required) : null,
              category, status, visibility,
              display_order: Number(display_order), created_by: req.user.userId },
    })

    await logAction(req.user.userId, 'module.created', module.id, module.name, null, { name, status })
    res.json({ success: true, data: { module } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── GET /admin/manage/modules/:id ──
router.get('/:id', ...admin, async (req, res) => {
  try {
    const module = await prisma.module.findUnique({
      where: { id: req.params.id },
      include: { plan_modules: { include: { plan: { select: { id: true, name: true } } } } },
    })
    if (!module) return res.status(404).json({ success: false, error: 'Module not found' })
    res.json({ success: true, data: { module } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── PUT /admin/manage/modules/:id — full update ──
router.put('/:id', ...admin, async (req, res) => {
  const { name, slug, short_description, full_description, thumbnail_url,
          credit_cost, cert_sessions_required, category, status, visibility, display_order } = req.body
  try {
    const old = await prisma.module.findUnique({ where: { id: req.params.id } })
    if (!old) return res.status(404).json({ success: false, error: 'Module not found' })

    if (slug && slug !== old.slug) {
      const taken = await prisma.module.findUnique({ where: { slug } })
      if (taken) return res.status(400).json({ success: false, error: 'Slug already in use' })
    }

    const module = await prisma.module.update({
      where: { id: req.params.id },
      data: {
        ...(name                   !== undefined && { name: name.trim() }),
        ...(slug                   !== undefined && { slug }),
        ...(short_description      !== undefined && { short_description }),
        ...(full_description       !== undefined && { full_description }),
        ...(thumbnail_url          !== undefined && { thumbnail_url }),
        ...(credit_cost            !== undefined && { credit_cost: Number(credit_cost) }),
        ...(cert_sessions_required !== undefined && {
          cert_sessions_required: cert_sessions_required === null || cert_sessions_required === '' ? null : Number(cert_sessions_required),
        }),
        ...(category               !== undefined && { category }),
        ...(status                 !== undefined && { status }),
        ...(visibility             !== undefined && { visibility }),
        ...(display_order          !== undefined && { display_order: Number(display_order) }),
      },
    })
    await logAction(req.user.userId, 'module.updated', module.id, module.name,
      { name: old.name, status: old.status }, { name: module.name, status: module.status })
    res.json({ success: true, data: { module } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── PATCH /admin/manage/modules/:id/status — toggle published/unpublished ──
router.patch('/:id/status', ...admin, async (req, res) => {
  try {
    const old = await prisma.module.findUnique({ where: { id: req.params.id } })
    if (!old) return res.status(404).json({ success: false, error: 'Module not found' })

    const newStatus = old.status === 'published' ? 'unpublished' : 'published'
    const module = await prisma.module.update({
      where: { id: req.params.id },
      data:  { status: newStatus },
    })
    await logAction(req.user.userId, `module.${newStatus}`, module.id, module.name,
      { status: old.status }, { status: newStatus })
    res.json({ success: true, data: { module } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

export default router
