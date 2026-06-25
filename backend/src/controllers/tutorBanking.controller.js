import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

// ── Tutor: get own banking details ────────────────────────────
// GET /api/v1/tutors/me/banking
export const getMyBanking = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const details = await prisma.tutorBankingDetails.findUnique({
      where: { tutor_id: tutorId },
      include: { verifier: { select: { id: true, first_name: true, last_name: true } } },
    })
    return res.json({ success: true, data: { banking: details } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── Tutor: upsert own banking details ────────────────────────
// PUT /api/v1/tutors/me/banking
export const updateMyBanking = async (req, res) => {
  try {
    const tutorId = req.user.userId

    // Only approved tutors can save banking details
    const tutor = await prisma.user.findUnique({ where: { id: tutorId }, select: { approved: true, role: true } })
    if (!tutor || tutor.role !== 'tutor') return res.status(403).json({ success: false, error: 'Tutor account required' })
    if (!tutor.approved) return res.status(403).json({ success: false, error: 'Account not yet approved' })

    const {
      account_holder_name, bank_name, account_number, routing_number,
      account_type, iban, swift_code, paypal_email, preferred_method, notes,
    } = req.body

    if (!account_holder_name?.trim()) {
      return res.status(400).json({ success: false, error: 'Account holder name is required' })
    }

    const data = {
      account_holder_name: account_holder_name.trim(),
      bank_name:        bank_name?.trim()        || null,
      account_number:   account_number?.trim()   || null,
      routing_number:   routing_number?.trim()   || null,
      account_type:     account_type             || 'checking',
      iban:             iban?.trim()             || null,
      swift_code:       swift_code?.trim()       || null,
      paypal_email:     paypal_email?.trim()     || null,
      preferred_method: preferred_method         || 'bank_transfer',
      notes:            notes?.trim()            || null,
      // Reset verification when tutor changes their own details
      verified: false, verified_by: null, verified_at: null,
    }

    const existing = await prisma.tutorBankingDetails.findUnique({ where: { tutor_id: tutorId } })
    const banking = existing
      ? await prisma.tutorBankingDetails.update({ where: { tutor_id: tutorId }, data })
      : await prisma.tutorBankingDetails.create({ data: { tutor_id: tutorId, ...data } })

    return res.json({ success: true, data: { banking } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── Admin: view tutor banking details ─────────────────────────
// GET /api/v1/admin/tutors/:id/banking
export const adminGetBanking = async (req, res) => {
  try {
    const details = await prisma.tutorBankingDetails.findUnique({
      where:   { tutor_id: req.params.id },
      include: { verifier: { select: { id: true, first_name: true, last_name: true } } },
    })
    return res.json({ success: true, data: { banking: details } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── Admin: verify tutor banking details ───────────────────────
// POST /api/v1/admin/tutors/:id/banking/verify
export const adminVerifyBanking = async (req, res) => {
  try {
    const adminId = req.user.userId
    const existing = await prisma.tutorBankingDetails.findUnique({ where: { tutor_id: req.params.id } })
    if (!existing) return res.status(404).json({ success: false, error: 'No banking details found' })

    const banking = await prisma.tutorBankingDetails.update({
      where: { tutor_id: req.params.id },
      data:  { verified: true, verified_by: adminId, verified_at: new Date() },
    })
    return res.json({ success: true, data: { banking } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── Admin: list payouts for a tutor ───────────────────────────
// GET /api/v1/admin/tutors/:id/payouts
export const adminGetPayouts = async (req, res) => {
  try {
    const payouts = await prisma.tutorPayout.findMany({
      where:   { tutor_id: req.params.id },
      include: { admin: { select: { id: true, first_name: true, last_name: true } } },
      orderBy: { paid_at: 'desc' },
    })
    const total_cents = payouts.reduce((s, p) => s + p.amount_cents, 0)
    return res.json({ success: true, data: { payouts, total_cents } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── Admin: get single payout receipt ─────────────────────────
// GET /api/v1/admin/tutors/:id/payouts/:payoutId
export const adminGetPayout = async (req, res) => {
  try {
    const payout = await prisma.tutorPayout.findUnique({
      where:   { id: req.params.payoutId },
      include: {
        tutor: { select: { id: true, first_name: true, last_name: true, email: true } },
        admin: { select: { id: true, first_name: true, last_name: true, email: true } },
      },
    })
    if (!payout || payout.tutor_id !== req.params.id) {
      return res.status(404).json({ success: false, error: 'Payout not found' })
    }
    return res.json({ success: true, data: { payout } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── Admin: record a payout to a tutor ────────────────────────
// POST /api/v1/admin/tutors/:id/payouts
export const adminRecordPayout = async (req, res) => {
  try {
    const adminId = req.user.userId
    const tutorId = req.params.id

    const tutor = await prisma.user.findUnique({ where: { id: tutorId }, select: { id: true, first_name: true, last_name: true, role: true } })
    if (!tutor || tutor.role !== 'tutor') return res.status(404).json({ success: false, error: 'Tutor not found' })

    const { amount_cents, currency, method, reference_number, notes, period_start, period_end, paid_at } = req.body
    if (!amount_cents || amount_cents <= 0) {
      return res.status(400).json({ success: false, error: 'amount_cents must be a positive integer' })
    }

    const payout = await prisma.tutorPayout.create({
      data: {
        tutor_id:         tutorId,
        amount_cents:     Number(amount_cents),
        currency:         currency          || 'usd',
        method:           method            || 'bank_transfer',
        reference_number: reference_number?.trim() || null,
        notes:            notes?.trim()            || null,
        paid_by:          adminId,
        paid_at:          paid_at ? new Date(paid_at) : new Date(),
        period_start:     period_start ? new Date(period_start) : null,
        period_end:       period_end   ? new Date(period_end)   : null,
      },
      include: {
        admin: { select: { id: true, first_name: true, last_name: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        actor_id:       adminId,
        target_user_id: tutorId,
        action:         'payroll.payout.recorded',
        entity_type:    'tutor_payout',
        entity_id:      payout.id,
        new_value:      { amount_cents: payout.amount_cents, method: payout.method, reference_number: payout.reference_number },
      },
    })

    const receiptId = payout.id.slice(-8).toUpperCase()
    await prisma.notification.create({
      data: {
        user_id: tutorId,
        title:   'Payment received',
        message: `Receipt #${receiptId} — $${(payout.amount_cents / 100).toFixed(2)} paid via ${payout.method.replace(/_/g, ' ')}${payout.reference_number ? ` · Ref: ${payout.reference_number}` : ''}.${payout.notes ? ` Note: ${payout.notes}` : ''}`,
        type:    'info',
        sent_by: adminId,
      },
    })

    return res.status(201).json({ success: true, data: { payout } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

// ── Tutor: get own payout history ─────────────────────────────
// GET /api/v1/tutors/me/payouts
export const getMyPayouts = async (req, res) => {
  try {
    const tutorId = req.user.userId
    const payouts = await prisma.tutorPayout.findMany({
      where:   { tutor_id: tutorId },
      include: { admin: { select: { id: true, first_name: true, last_name: true } } },
      orderBy: { paid_at: 'desc' },
    })
    const total_cents = payouts.reduce((s, p) => s + p.amount_cents, 0)
    return res.json({ success: true, data: { payouts, total_cents } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}
