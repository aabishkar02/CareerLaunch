import { Router } from 'express'
import { protect as auth, authorize } from '../middleware/auth.middleware.js'
import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

const router = Router()
const admin  = [auth, authorize('admin')]

async function logAction(actorId, action, entityId, entityName, oldVal, newVal) {
  await prisma.auditLog.create({
    data: {
      actor_id:    actorId,
      action,
      entity_type: 'plan',
      entity_id:   entityId,
      old_value:   oldVal || undefined,
      new_value:   newVal || { name: entityName },
    },
  }).catch(() => {})
}

const PLAN_INCLUDE = {
  plan_modules: {
    orderBy: { display_order: 'asc' },
    include: { module: { select: { id:true, name:true, slug:true, status:true, credit_cost:true } } },
  },
  _count: { select: { payments: true } },
}

// ── GET /admin/manage/plans ──
router.get('/', ...admin, async (req, res) => {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
      include: PLAN_INCLUDE,
    })
    res.json({ success: true, data: { plans } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── POST /admin/manage/plans — create ──
router.post('/', ...admin, async (req, res) => {
  const { name, tagline, description, credits_per_module = 4, price_cents = 0, currency = 'usd', billing_type = 'one_time',
          whats_included = [], status = 'draft', is_recommended = false, badge_label,
          display_order = 0, stripe_plan_id, modules = [] } = req.body

  if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' })

  try {
    if (is_recommended) {
      await prisma.plan.updateMany({ where: { is_recommended: true }, data: { is_recommended: false } })
    }

    const plan = await prisma.plan.create({
      data: {
        name: name.trim(), tagline, description, credits_per_module: Number(credits_per_module), price_cents: Number(price_cents), currency,
        billing_type, whats_included, status, is_recommended: Boolean(is_recommended),
        badge_label, display_order: Number(display_order), stripe_plan_id,
        created_by: req.user.userId,
        plan_modules: {
          create: modules.map((m, i) => ({
            module_id:        m.module_id,
            credits_included: Number(m.credits_included ?? 1),
            display_order:    Number(m.display_order ?? i),
          })),
        },
      },
      include: PLAN_INCLUDE,
    })
    await logAction(req.user.userId, 'plan.created', plan.id, plan.name, null, { name, status, is_recommended })
    res.json({ success: true, data: { plan } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── GET /admin/manage/plans/:id ──
router.get('/:id', ...admin, async (req, res) => {
  try {
    const plan = await prisma.plan.findUnique({ where: { id: req.params.id }, include: PLAN_INCLUDE })
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' })
    res.json({ success: true, data: { plan } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── PUT /admin/manage/plans/:id — full update ──
router.put('/:id', ...admin, async (req, res) => {
  const { name, tagline, description, credits_per_module, price_cents, currency, billing_type, whats_included,
          status, is_recommended, badge_label, display_order, stripe_plan_id,
          modules } = req.body
  try {
    const old = await prisma.plan.findUnique({ where: { id: req.params.id } })
    if (!old) return res.status(404).json({ success: false, error: 'Plan not found' })

    if (is_recommended && !old.is_recommended) {
      await prisma.plan.updateMany({ where: { is_recommended: true }, data: { is_recommended: false } })
    }

    const data = {
      ...(name           !== undefined && { name: name.trim() }),
      ...(tagline             !== undefined && { tagline }),
      ...(description         !== undefined && { description }),
      ...(credits_per_module  !== undefined && { credits_per_module: Number(credits_per_module) }),
      ...(price_cents         !== undefined && { price_cents: Number(price_cents) }),
      ...(currency       !== undefined && { currency }),
      ...(billing_type   !== undefined && { billing_type }),
      ...(whats_included !== undefined && { whats_included }),
      ...(status         !== undefined && { status }),
      ...(is_recommended !== undefined && { is_recommended: Boolean(is_recommended) }),
      ...(badge_label    !== undefined && { badge_label }),
      ...(display_order  !== undefined && { display_order: Number(display_order) }),
      ...(stripe_plan_id !== undefined && { stripe_plan_id }),
    }

    if (modules !== undefined) {
      await prisma.planModule.deleteMany({ where: { plan_id: req.params.id } })
      data.plan_modules = {
        create: modules.map((m, i) => ({
          module_id:        m.module_id,
          credits_included: Number(m.credits_included ?? 1),
          display_order:    Number(m.display_order ?? i),
        })),
      }
    }

    const plan = await prisma.plan.update({ where: { id: req.params.id }, data, include: PLAN_INCLUDE })
    await logAction(req.user.userId, 'plan.updated', plan.id, plan.name,
      { name: old.name, status: old.status }, { name: plan.name, status: plan.status })
    res.json({ success: true, data: { plan } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── DELETE /admin/manage/plans/:id ──
router.delete('/:id', ...admin, async (req, res) => {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { payments: true } } },
    })
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' })
    await prisma.plan.delete({ where: { id: req.params.id } })
    await logAction(req.user.userId, 'plan.deleted', plan.id, plan.name, { name: plan.name }, null)
    res.json({ success: true, message: 'Plan deleted' })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── PATCH /admin/manage/plans/:id/recommend — set as most recommended ──
router.patch('/:id/recommend', ...admin, async (req, res) => {
  try {
    const old = await prisma.plan.findUnique({ where: { id: req.params.id } })
    if (!old) return res.status(404).json({ success: false, error: 'Plan not found' })

    await prisma.plan.updateMany({ where: { is_recommended: true }, data: { is_recommended: false } })
    const plan = await prisma.plan.update({
      where: { id: req.params.id },
      data:  { is_recommended: true },
    })
    await logAction(req.user.userId, 'plan.recommended', plan.id, plan.name,
      { is_recommended: old.is_recommended }, { is_recommended: true })
    res.json({ success: true, data: { plan } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── GET /public/plans — public listing of active plans ──
router.get('/public/list', async (req, res) => {
  try {
    const plans = await prisma.plan.findMany({
      where:   { status: 'active' },
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
      include: {
        plan_modules: {
          orderBy: { display_order: 'asc' },
          where:   { module: { status: 'published' } },
          include: { module: {
            select: { id:true, name:true, slug:true, short_description:true,
                      credit_cost:true, category:true },
          }},
        },
      },
    })
    res.json({ success: true, data: { plans } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// ── GET /public/plans/:id — single plan detail ──
router.get('/public/:id', async (req, res) => {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: req.params.id },
      include: {
        plan_modules: {
          orderBy: { display_order: 'asc' },
          include: { module: true },
        },
      },
    })
    if (!plan || plan.status !== 'active') {
      return res.status(404).json({ success: false, error: 'Plan not found' })
    }
    res.json({ success: true, data: { plan } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

export default router
