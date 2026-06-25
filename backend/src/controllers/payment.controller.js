import { prisma } from '../config/db.js'
import stripe from '../config/stripe.js'
import { safeError } from '../utils/prodError.js'

// Test-card auto-confirm is OPT-IN and can never run in production. Set
// ENABLE_TEST_PAYMENTS=true only in local/dev to skip manual card entry.
const TEST_PAYMENTS_ENABLED =
  process.env.ENABLE_TEST_PAYMENTS === 'true' && process.env.NODE_ENV !== 'production'

// Parses COUPON_CODES="CODE1:CENTS,CODE2:CENTS" from env at startup
const COUPON_MAP = (() => {
  const raw = process.env.COUPON_CODES || ''
  return Object.fromEntries(
    raw.split(',')
      .filter(Boolean)
      .map(pair => {
        const [code, cents] = pair.trim().split(':')
        return [code.trim().toUpperCase(), parseInt(cents, 10)]
      })
      .filter(([, cents]) => !isNaN(cents))
  )
})()

// Builds the per-module credit breakdown for a payment receipt.
// Priority: plan_modules (managed plan) → credits_per_module fallback → ModuleCredit actual records
export async function buildModuleEnrollments(payment, studentId) {
  const planModules   = payment.managed_plan?.plan_modules || []
  const credPerModule = payment.managed_plan?.credits_per_module ?? null

  if (planModules.length > 0) {
    // Managed plan with explicit per-module entries — use credits_included from each row
    return planModules.map(pm => ({
      module_id:         pm.module_id,
      module:            pm.module,
      credits_purchased: pm.credits_included,
    }))
  }

  // No plan_modules rows: fall back to the payment's actual ModuleEnrollment records
  const meRows = payment.module_enrollments || []
  if (meRows.length === 0) return []

  const sid = studentId || payment.student_id
  const moduleIds = meRows.map(me => me.module_id)

  // Look up actual credits granted from ModuleCredit (set at purchase time)
  const creditRows = await prisma.moduleCredit.findMany({
    where:  { student_id: sid, module_id: { in: moduleIds } },
    select: { module_id: true, credits_granted: true },
  })
  const creditMap = Object.fromEntries(creditRows.map(c => [c.module_id, c.credits_granted]))

  return meRows.map(me => ({
    module_id:         me.module_id,
    module:            me.module,
    // prefer actual credits_granted; fall back to plan-level credits_per_module
    credits_purchased: creditMap[me.module_id] ?? credPerModule,
  }))
}

// Generates a unique human-readable receipt number: RCP-YYYYMMDD-XXXX
async function generateReceiptNumber() {
  const date    = new Date()
  const prefix  = `RCP-${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}-`
  let attempts  = 0
  while (attempts < 10) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000))
    const num    = prefix + suffix
    const exists = await prisma.payment.findUnique({ where: { receipt_number: num } })
    if (!exists) return num
    attempts++
  }
  // Fallback: append timestamp millis for guaranteed uniqueness
  return prefix + Date.now().toString().slice(-5)
}

// The canonical course that holds all 8 modules. Must be set via env var so the
// value doesn't have to be baked into the codebase for each environment.
const CANONICAL_COURSE_ID = process.env.CANONICAL_COURSE_ID
if (!CANONICAL_COURSE_ID) {
  console.error('[startup] CANONICAL_COURSE_ID env var is not set — standard plan purchases will fail.')
}
const CREDITS_PER_MODULE  = 5   // 70-min sessions granted per module purchase

// Plan → which module order_indexes are included
const PLAN_MODULE_INDEXES = {
  starter:      [1, 2, 3, 4],
  professional: [5, 6, 7, 8],
  complete:     [1, 2, 3, 4, 5, 6, 7, 8],
  // 'single' is handled separately using moduleOrderIndex
}

// ─── Price map — cents ────────────────────────────────────────
// Matches your PlanType enum: single | starter | professional | complete
const PLAN_PRICES = {
  single:       4900,   // $49
  starter:      14900,  // $149
  professional: 14900,  // $149
  complete:     24900,  // $249
}

// ─── Create Payment Intent ────────────────────────────────────
// POST /api/v1/payments/create-intent
// Body: { courseId, planType, couponCode? }
// Protected — student only

export const createPaymentIntent = async (req, res) => {
  try {
    const { courseId, planType, couponCode, moduleOrderIndex } = req.body
    const studentId = req.user.userId

    if (!courseId || !planType) {
      return res.status(400).json({
        success: false,
        error: 'courseId and planType are required',
      })
    }

    if (!PLAN_PRICES[planType]) {
      return res.status(400).json({
        success: false,
        error: `Invalid planType. Must be one of: ${Object.keys(PLAN_PRICES).join(', ')}`,
      })
    }

    // 1. Find pricing plan — look in the supplied courseId, fallback to any active plan with this type
    const pricingPlan = await prisma.pricingPlan.findFirst({
      where: { plan_type: planType, active: true },
    })

    // Use DB price if exists, fallback to hardcoded map
    let amountCents = pricingPlan?.price_cents || PLAN_PRICES[planType]
    let discountCents = 0

    // 4. Apply coupon if provided
    if (couponCode) {
      const discount = COUPON_MAP[couponCode.toUpperCase()]
      if (discount) {
        discountCents = discount
        amountCents = Math.max(amountCents - discountCents, 100) // min $1
      }
    }

    // 5. Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: 'usd',
      metadata: {
        student_id:        studentId,
        course_id:         courseId,
        plan_type:         planType,
        plan_id:           pricingPlan?.id || '',
        coupon_code:       couponCode || '',
        module_order_index: moduleOrderIndex ? String(moduleOrderIndex) : '',
      },
      automatic_payment_methods: {
        enabled:         true,
        allow_redirects: 'never',
      },
    })

    // 6. Create a pending payment record (for billing history only — NOT an enrollment gate)
    const resolvedPlanId = pricingPlan?.id
      || (await getOrCreateDefaultPlan(CANONICAL_COURSE_ID, planType, amountCents)).id

    await prisma.payment.create({
      data: {
        student_id:               studentId,
        course_id:                CANONICAL_COURSE_ID,
        plan_id:                  resolvedPlanId,
        stripe_payment_intent_id: paymentIntent.id,
        amount_cents:             amountCents,
        currency:                 'usd',
        status:                   'pending',
        payment_method:           'stripe',
        coupon_code:              couponCode || null,
        discount_cents:           discountCents,
      },
    })

    return res.status(200).json({
      success: true,
      data: {
        clientSecret:    paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount:          amountCents,
        currency:        'usd',
        discountApplied: discountCents > 0,
        discountCents,
      },
    })
  } catch (error) {
    console.error('Create payment intent error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Shared fulfillment ───────────────────────────────────────
// Resolves the Stripe receipt URL from a payment intent's latest charge.
async function getReceiptUrl(pi) {
  if (!pi.latest_charge) return null
  try {
    const charge = await stripe.charges.retrieve(pi.latest_charge)
    return charge.receipt_url
  } catch {
    return null
  }
}

// Works out which modules a payment should unlock and how many credits each
// gets. Standard plans use the canonical course + fixed CREDITS_PER_MODULE;
// managed plans use their PlanModule rows (or the student's chosen module).
async function resolveFulfillmentTargets(payment, pi) {
  if (payment.managed_plan_id) {
    const planModules = payment.managed_plan?.plan_modules || []
    if (planModules.length > 0) {
      return planModules
        .filter(pm => pm.module?.id)
        .map(pm => ({ module_id: pm.module.id, credits: pm.credits_included || 1 }))
    }
    // Single-module managed plan — the student picked a module at checkout.
    const selectedModuleId = pi.metadata?.selected_module_id || null
    if (!selectedModuleId) return []
    return [{ module_id: selectedModuleId, credits: payment.managed_plan?.credits_per_module || 1 }]
  }

  // Standard (canonical-course) plan.
  const planType    = pi.metadata?.plan_type
  const moduleIndex = pi.metadata?.module_order_index ? parseInt(pi.metadata.module_order_index) : null
  const indexes = planType === 'single'
    ? (moduleIndex ? [moduleIndex] : [])
    : (PLAN_MODULE_INDEXES[planType] || [])
  if (indexes.length === 0) return []

  const canonicalModules = await prisma.courseModule.findMany({
    where:  { course_id: CANONICAL_COURSE_ID, order_index: { in: indexes } },
    select: { id: true },
  })
  return canonicalModules.map(m => ({ module_id: m.id, credits: CREDITS_PER_MODULE }))
}

// Idempotently fulfills a SUCCEEDED payment intent: marks the payment succeeded,
// grants module enrollments + session credits, and notifies the student.
//
// Safe to call from BOTH the client confirm endpoint and the Stripe webhook.
// A conditional "claim" update (status != succeeded) acts as a compare-and-swap
// so that whichever caller commits first wins and the other becomes a no-op —
// credits are never granted twice. The webhook is the real source of truth;
// the client call is just a faster UX path.
export async function fulfillPaymentIntent(pi) {
  if (pi.status !== 'succeeded') return { fulfilled: false, reason: `status:${pi.status}` }

  const payment = await prisma.payment.findUnique({
    where:   { stripe_payment_intent_id: pi.id },
    include: { managed_plan: { include: { plan_modules: { include: { module: true } } } } },
  })
  if (!payment) return { fulfilled: false, reason: 'no_payment_record' }
  if (payment.status === 'succeeded') {
    return {
      fulfilled: true, alreadyProcessed: true,
      receipt_url: payment.receipt_url, receipt_number: payment.receipt_number,
      modules_unlocked: 0, credits_added: 0,
    }
  }

  const studentId     = payment.student_id
  const isManaged     = !!payment.managed_plan_id
  const receiptUrl    = await getReceiptUrl(pi)
  const receiptNumber = payment.receipt_number || await generateReceiptNumber()
  const targets       = await resolveFulfillmentTargets(payment, pi)
  const totalCredits  = targets.reduce((s, t) => s + t.credits, 0)

  let claimed = true
  await prisma.$transaction(async (tx) => {
    // Compare-and-swap: only the caller that flips pending→succeeded proceeds.
    const claim = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: 'succeeded' } },
      data:  { status: 'succeeded', receipt_url: receiptUrl, receipt_number: receiptNumber },
    })
    if (claim.count === 0) { claimed = false; return }  // another caller already fulfilled it

    for (const t of targets) {
      await tx.moduleEnrollment.upsert({
        where:  { student_id_module_id: { student_id: studentId, module_id: t.module_id } },
        update: { status: 'active' },
        create: {
          student_id: studentId,
          module_id:  t.module_id,
          ...(isManaged ? {} : { course_id: CANONICAL_COURSE_ID }),
          payment_id: payment.id,
          status:     'active',
        },
      })
      await tx.moduleCredit.upsert({
        where:  { student_id_module_id: { student_id: studentId, module_id: t.module_id } },
        update: { credits_granted: { increment: t.credits } },
        create: { student_id: studentId, module_id: t.module_id, credits_granted: t.credits, credits_used: 0 },
      })
    }

    await tx.notification.create({
      data: {
        user_id: studentId,
        title:   'Session credits added',
        message: isManaged
          ? `Your purchase of "${payment.managed_plan?.name}" is complete. ${totalCredits} session credit${totalCredits !== 1 ? 's' : ''} added.`
          : `Payment successful! ${totalCredits} session credit${totalCredits !== 1 ? 's' : ''} added across ${targets.length} module${targets.length !== 1 ? 's' : ''}. Each credit = 1 × 70-min session.`,
        type:    'info',
      },
    })
  })

  if (!claimed) {
    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } })
    return {
      fulfilled: true, alreadyProcessed: true,
      receipt_url: fresh?.receipt_url, receipt_number: fresh?.receipt_number,
      modules_unlocked: 0, credits_added: 0,
    }
  }

  return {
    fulfilled: true,
    modules_unlocked: targets.length,
    credits_added:    totalCredits,
    receipt_url:      receiptUrl,
    receipt_number:   receiptNumber,
  }
}

// ─── Confirm Payment ──────────────────────────────────────────
// POST /api/v1/payments/confirm
// Body: { paymentIntentId }
// Protected — student only
// Plans are bundles of modules. Confirming a payment grants session
// credits to each module in the plan. Buying the same plan again
// simply adds more credits — there is NO "already enrolled" block.
export const confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body
    const studentId = req.user.userId

    if (!paymentIntentId) {
      return res.status(400).json({ success: false, error: 'paymentIntentId is required' })
    }

    // 1. Retrieve the Stripe payment intent. In local/dev only (opt-in flag),
    // auto-confirm with a test card so manual card entry is not required.
    let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (
      TEST_PAYMENTS_ENABLED &&
      ['requires_payment_method', 'requires_confirmation'].includes(paymentIntent.status)
    ) {
      paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: 'pm_card_visa',
        return_url:     `${process.env.FRONTEND_URL}/dashboard`,
      })
    }

    if (paymentIntent.status !== 'succeeded') {
      return res.status(402).json({
        success: false,
        error: `Payment not completed. Status: ${paymentIntent.status}`,
      })
    }

    // 2. Verify ownership
    if (paymentIntent.metadata.student_id !== studentId) {
      return res.status(403).json({ success: false, error: 'Payment does not belong to this account' })
    }

    // 3. Fulfill (idempotent; shared with the webhook)
    const result = await fulfillPaymentIntent(paymentIntent)
    if (!result.fulfilled) {
      return res.status(404).json({ success: false, error: 'Payment record not found' })
    }

    return res.status(200).json({
      success: true,
      message: result.alreadyProcessed
        ? 'Payment already processed'
        : 'Payment confirmed. Module credits have been added.',
      data: {
        modules_unlocked: result.modules_unlocked,
        credits_added:    result.credits_added,
        receipt_url:      result.receipt_url,
        receipt_number:   result.receipt_number,
      },
    })
  } catch (error) {
    console.error('Confirm payment error:', error)
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
}

// ─── Stripe Webhook ───────────────────────────────────────────
// POST /api/v1/payments/webhook
// Raw body — no JSON middleware on this route

export const stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature failed:', err.message)
    return res.status(400).json({ error: `Webhook error: ${err.message}` })
  }

  try {
    switch (event.type) {

      case 'payment_intent.succeeded': {
        const pi = event.data.object
        // Source of truth for fulfillment — grants credits/enrollments idempotently
        // even if the client never calls /confirm (closed tab, lost connection, etc.)
        const result = await fulfillPaymentIntent(pi)
        if (!result.fulfilled && result.reason === 'no_payment_record') {
          console.warn(`Webhook: no payment record for intent ${pi.id}`)
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object
        await prisma.payment.updateMany({
          where: { stripe_payment_intent_id: pi.id },
          data:  { status: 'failed' },
        })
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object
        await prisma.payment.updateMany({
          where: { stripe_payment_intent_id: charge.payment_intent },
          data:  { status: 'refunded', refunded_at: new Date() },
        })
        break
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`)
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}

// ─── Get Payment History ──────────────────────────────────────
// GET /api/v1/payments/history
// Protected — student only

export const getPaymentHistory = async (req, res) => {
  try {
    const studentId = req.user.userId

    const payments = await prisma.payment.findMany({
      where:   { student_id: studentId },
      orderBy: { created_at: 'desc' },
      include: {
        plan:         { select: { plan_type: true, price_cents: true } },
        managed_plan: { select: { id: true, name: true, tagline: true } },
        module_enrollments: {
          include: { module: { select: { id: true, name: true, display_order: true } } },
        },
      },
    })

    return res.status(200).json({
      success: true,
      data: { payments },
    })
  } catch (error) {
    console.error('Payment history error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Admin: All Payments ──────────────────────────────────────
// GET /api/v1/admin/payments
// Protected — admin only

export const adminGetPayments = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query

    const where = status ? { status } : {}

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip:  (parseInt(page) - 1) * parseInt(limit),
        take:  parseInt(limit),
        include: {
          student: { select: { id: true, first_name: true, last_name: true, email: true } },
          plan:    { select: { plan_type: true } },
        },
      }),
      prisma.payment.count({ where }),
    ])

    const totalRevenue = await prisma.payment.aggregate({
      where:  { status: 'succeeded' },
      _sum:   { amount_cents: true },
    })

    return res.status(200).json({
      success: true,
      data: {
        payments,
        total,
        page:          parseInt(page),
        total_revenue: totalRevenue._sum.amount_cents || 0,
      },
    })
  } catch (error) {
    console.error('Admin get payments error:', error)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

// ─── Admin: Refund ────────────────────────────────────────────
// POST /api/v1/payments/admin/:id/refund
// Protected — admin only
// On refund:
//   1. Issue Stripe refund
//   2. Zero out remaining credits for each affected module
//   3. Cancel module enrollments tied to this payment
//   4. Cancel the course enrollment if present
//   5. Notify student
//   6. Create detailed audit log

export const adminRefundPayment = async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Reason is required for refund' })
    }

    const payment = await prisma.payment.findUnique({
      where:   { id },
      include: {
        plan:    { select: { plan_type: true } },
        student: { select: { id: true, first_name: true, last_name: true, email: true } },
        managed_plan: {
          select: { credits_per_module: true, plan_modules: { select: { module_id: true, credits_included: true } } },
        },
        module_enrollments: { select: { id: true, module_id: true } },
      },
    })
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' })

    if (payment.status !== 'succeeded') {
      return res.status(400).json({ success: false, error: 'Only succeeded payments can be refunded' })
    }

    // 1. Issue Stripe refund — non-fatal so DB changes always run.
    // If Stripe fails, the admin is warned in the response so they can manually
    // process the financial refund while credits are still reversed in the DB.
    let stripeRefund = null
    let stripeRefundFailed = false
    if (payment.stripe_payment_intent_id) {
      try {
        stripeRefund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          reason:         'requested_by_customer',
        })
      } catch (stripeErr) {
        console.error('Stripe refund failed (continuing with DB refund):', stripeErr.message)
        stripeRefundFailed = true
      }
    }

    // How many credits did THIS payment grant per module? Reconstruct the same
    // way fulfillment did, so we remove exactly what was added.
    const creditsForModule = (moduleId) => {
      if (payment.managed_plan_id) {
        const pm = (payment.managed_plan?.plan_modules || []).find(p => p.module_id === moduleId)
        if (pm) return pm.credits_included || 1
        return payment.managed_plan?.credits_per_module || 1   // single-module managed plan
      }
      return CREDITS_PER_MODULE   // standard canonical-course plan
    }

    // 2. Reverse fulfillment in a single transaction: mark refunded, claw back
    // the granted credits (never below what's already been used), and cancel the
    // module enrollments this payment created.
    const reversedModules = []
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id },
        data:  { status: 'refunded', refunded_at: new Date(), refund_reason: reason },
      })

      for (const en of payment.module_enrollments) {
        const removeAmt = creditsForModule(en.module_id)
        const credit = await tx.moduleCredit.findUnique({
          where: { student_id_module_id: { student_id: payment.student_id, module_id: en.module_id } },
        })
        if (credit) {
          // Can't revoke credits the student already consumed.
          const newGranted = Math.max(credit.credits_used, credit.credits_granted - removeAmt)
          if (newGranted !== credit.credits_granted) {
            await tx.moduleCredit.update({
              where: { student_id_module_id: { student_id: payment.student_id, module_id: en.module_id } },
              data:  { credits_granted: newGranted },
            })
          }
        }
        await tx.moduleEnrollment.update({ where: { id: en.id }, data: { status: 'cancelled' } })
        reversedModules.push(en.module_id)
      }
    })

    // 3. Notify student
    await prisma.notification.create({
      data: {
        user_id: payment.student_id,
        title:   'Payment refunded',
        message: `Your payment of $${(payment.amount_cents / 100).toFixed(2)} has been refunded. Any unused session credits from this purchase have been removed. Contact support if you have questions.`,
        type:    'info',
        sent_by: req.user.userId,
      },
    })

    // 4. Audit log
    await prisma.auditLog.create({
      data: {
        actor_id:       req.user.userId,
        target_user_id: payment.student_id,
        action:         'payment.refunded',
        entity_type:    'payment',
        entity_id:      id,
        old_value:      { status: 'succeeded' },
        new_value:      { status: 'refunded', reason, stripe_refund_id: stripeRefund?.id || null, modules_reversed: reversedModules },
      },
    })

    return res.status(200).json({
      success: true,
      ...(stripeRefundFailed && {
        warning: 'DB credits reversed but the Stripe financial refund failed. You must manually refund this payment in the Stripe dashboard.',
      }),
      data: {
        refund: {
          stripe_refund_id:    stripeRefund?.id || null,
          stripe_refund_failed: stripeRefundFailed,
          modules_reversed:    reversedModules,
        },
      },
    })
  } catch (error) {
    console.error('Admin refund error:', error)
    return res.status(500).json({ success: false, error: safeError(error) })
  }
}

// ─── Helper — get or create default pricing plan ──────────────
async function getOrCreateDefaultPlan(courseId, planType, amountCents) {
  const existing = await prisma.pricingPlan.findFirst({
    where: { course_id: courseId, plan_type: planType },
  })
  if (existing) return existing

  return prisma.pricingPlan.create({
    data: {
      course_id:   courseId,
      plan_type:   planType,
      price_cents: amountCents,
      currency:    'usd',
      active:      true,
    },
  })
}

// ─── Create Managed Plan Payment Intent ────────────────────────
// POST /api/v1/payments/create-managed-intent
// Body: { planId, couponCode? }
// Protected — student only
export const createManagedPlanIntent = async (req, res) => {
  try {
    const { planId, couponCode, selectedModuleId } = req.body
    const studentId = req.user.userId

    if (!planId) return res.status(400).json({ success: false, error: 'planId is required' })

    const plan = await prisma.plan.findUnique({
      where:   { id: planId },
      include: { plan_modules: { include: { module: { select: { id: true, name: true } } } } },
    })
    if (!plan || plan.status !== 'active') {
      return res.status(404).json({ success: false, error: 'Plan not found or not active' })
    }

    // Single-module plans require the student to choose a module
    if ((plan.plan_modules || []).length === 0 && !selectedModuleId) {
      return res.status(400).json({ success: false, error: 'selectedModuleId is required for single module plans' })
    }
    if (selectedModuleId) {
      const mod = await prisma.module.findUnique({ where: { id: selectedModuleId } })
      if (!mod || mod.status !== 'published') {
        return res.status(400).json({ success: false, error: 'Selected module not found or not available' })
      }
    }

    let amountCents = plan.price_cents
    let discountCents = 0

    if (couponCode) {
      const discount = COUPON_MAP[couponCode.toUpperCase()]
      if (discount) { discountCents = discount; amountCents = Math.max(amountCents - discountCents, 100) }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: plan.currency || 'usd',
      metadata: {
        student_id:         studentId,
        managed_plan_id:    planId,
        plan_name:          plan.name,
        coupon_code:        couponCode || '',
        selected_module_id: selectedModuleId || '',
      },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    })

    await prisma.payment.create({
      data: {
        student_id:               studentId,
        managed_plan_id:          planId,
        stripe_payment_intent_id: paymentIntent.id,
        amount_cents:             amountCents,
        currency:                 plan.currency || 'usd',
        status:                   'pending',
        payment_method:           'stripe',
        coupon_code:              couponCode || null,
        discount_cents:           discountCents,
      },
    })

    return res.json({
      success: true,
      data: {
        clientSecret:    paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount:          amountCents,
        currency:        plan.currency || 'usd',
        discountApplied: discountCents > 0,
        discountCents,
        plan: { id: plan.id, name: plan.name, price_cents: plan.price_cents },
      },
    })
  } catch (e) {
    console.error('Create managed intent error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Confirm Managed Plan Payment ─────────────────────────────
// POST /api/v1/payments/confirm-managed
// Body: { paymentIntentId }
export const confirmManagedPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body
    const studentId = req.user.userId

    if (!paymentIntentId) return res.status(400).json({ success: false, error: 'paymentIntentId required' })

    let pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (
      TEST_PAYMENTS_ENABLED &&
      ['requires_payment_method', 'requires_confirmation'].includes(pi.status)
    ) {
      pi = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: 'pm_card_visa',
        return_url: `${process.env.FRONTEND_URL}/dashboard`,
      })
    }
    if (pi.status !== 'succeeded') {
      return res.status(402).json({ success: false, error: `Payment not completed. Status: ${pi.status}` })
    }

    // Verify ownership before fulfilling
    if (pi.metadata.student_id !== studentId) {
      return res.status(403).json({ success: false, error: 'Payment does not belong to this account' })
    }

    // Fulfill (idempotent; shared with the webhook + standard confirm path)
    const result = await fulfillPaymentIntent(pi)
    if (!result.fulfilled) {
      return res.status(404).json({ success: false, error: 'Payment record not found' })
    }

    return res.json({
      success: true,
      message: result.alreadyProcessed ? 'Already processed' : 'Payment confirmed. Credits added.',
      data: {
        modules_unlocked: result.modules_unlocked,
        credits_added:    result.credits_added,
        receipt_url:      result.receipt_url,
        receipt_number:   result.receipt_number,
      },
    })
  } catch (e) {
    console.error('Confirm managed payment error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ─── Student: get single receipt ─────────────────────────────
// GET /api/v1/payments/receipt/:id   (id = payment UUID or receipt_number)
// Protected — student only (must own the payment)
export const getStudentReceipt = async (req, res) => {
  try {
    const studentId = req.user.userId
    const { id } = req.params

    // Allow lookup by UUID or receipt_number
    const isUuid = /^[0-9a-f-]{36}$/i.test(id)
    const payment = await prisma.payment.findFirst({
      where: isUuid
        ? { id, student_id: studentId }
        : { receipt_number: id, student_id: studentId },
      include: {
        plan:         { select: { plan_type: true, price_cents: true } },
        managed_plan: {
          select: {
            id: true, name: true, tagline: true,
            credits_per_module: true,
            plan_modules: {
              orderBy: { display_order: 'asc' },
              include: { module: { select: { id: true, name: true, display_order: true } } },
            },
          },
        },
        module_enrollments: {
          include: { module: { select: { id: true, name: true, display_order: true } } },
        },
      },
    })
    if (!payment) return res.status(404).json({ success: false, error: 'Receipt not found' })

    const module_enrollments = await buildModuleEnrollments(payment, studentId)
    return res.json({ success: true, data: { payment: { ...payment, module_enrollments } } })
  } catch (e) {
    console.error('getStudentReceipt error:', e)
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}