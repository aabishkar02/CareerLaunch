import { Router } from 'express'
import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

const router = Router()

// GET /api/v1/public/modules — published + public modules for landing page
router.get('/modules', async (req, res) => {
  try {
    const modules = await prisma.module.findMany({
      where:   { status: 'published', visibility: 'public' },
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
      select:  { id:true, name:true, slug:true, short_description:true,
                 thumbnail_url:true, credit_cost:true, category:true, display_order:true },
    })
    res.json({ success: true, data: { modules } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// GET /api/v1/public/modules/:slug — single published module detail with plans
router.get('/modules/:slug', async (req, res) => {
  try {
    const module = await prisma.module.findUnique({
      where: { slug: req.params.slug },
    })
    if (!module || module.status !== 'published') {
      return res.status(404).json({ success: false, error: 'Module not found' })
    }

    // Find active plans that include this module
    const planModules = await prisma.planModule.findMany({
      where: { module_id: module.id, plan: { status: 'active' } },
      orderBy: { plan: { display_order: 'asc' } },
      include: {
        plan: {
          select: { id:true, name:true, tagline:true, price_cents:true, currency:true,
                    billing_type:true, is_recommended:true, badge_label:true },
        },
      },
    })

    res.json({
      success: true,
      data: {
        module,
        plans: planModules.map(pm => ({ ...pm.plan, credits_included: pm.credits_included })),
      },
    })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// GET /api/v1/public/plans — active plans with their published modules
router.get('/plans', async (req, res) => {
  try {
    const plans = await prisma.plan.findMany({
      where:   { status: 'active' },
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
      include: {
        plan_modules: {
          orderBy: { display_order: 'asc' },
          where:   { module: { status: 'published' } },
          include: {
            module: {
              select: { id:true, name:true, slug:true, short_description:true,
                        credit_cost:true, category:true },
            },
          },
        },
      },
    })
    res.json({ success: true, data: { plans } })
  } catch (e) {
    res.status(500).json({ success: false, error: safeError(e) })
  }
})

// GET /api/v1/public/plans/:id — single active plan
router.get('/plans/:id', async (req, res) => {
  try {
    const plan = await prisma.plan.findUnique({
      where:   { id: req.params.id },
      include: {
        plan_modules: {
          orderBy: { display_order: 'asc' },
          where:   { module: { status: 'published' } },
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
