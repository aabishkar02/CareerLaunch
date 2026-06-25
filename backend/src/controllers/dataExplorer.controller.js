import { prisma } from '../config/db.js'
import { safeError } from '../utils/prodError.js'

const ALLOWED = [
  'User','Payment','Enrollment','Course','Module','Plan',
  'SupportTicket','AuditLog','TutorFee','TutorPayout',
  'Certification','OnboardingRequest','TutorProfile',
  'TutorBankingDetails','Notification','TutorReview',
]

const MODEL_KEY = {
  User:'user', Payment:'payment', Enrollment:'enrollment',
  Course:'course', Module:'module', Plan:'plan',
  SupportTicket:'supportTicket', AuditLog:'auditLog',
  TutorFee:'tutorFee', TutorPayout:'tutorPayout',
  Certification:'certification', OnboardingRequest:'onboardingRequest',
  TutorProfile:'tutorProfile', TutorBankingDetails:'tutorBankingDetails',
  Notification:'notification', TutorReview:'tutorReview',
}

const TABLE_META = {
  User:              { displayName:'Users',              keyFields:['id','email','first_name','last_name','role','suspended','created_at'] },
  Payment:           { displayName:'Payments',           keyFields:['id','student_id','amount_cents','status','payment_method','created_at'] },
  Enrollment:        { displayName:'Enrollments',        keyFields:['id','student_id','course_id','plan_type','status','enrolled_at'] },
  Course:            { displayName:'Courses',            keyFields:['id','title','slug','category','published','featured','created_at'] },
  Module:            { displayName:'Modules',            keyFields:['id','name','slug','status','visibility','display_order','created_at'] },
  Plan:              { displayName:'Plans',              keyFields:['id','name','price_cents','status','is_recommended','display_order','created_at'] },
  SupportTicket:     { displayName:'Support Tickets',    keyFields:['id','student_id','title','category','status','priority','created_at'] },
  AuditLog:          { displayName:'Audit Logs',         keyFields:['id','actor_id','action','entity_type','entity_id','created_at'] },
  TutorFee:          { displayName:'Tutor Fees',         keyFields:['id','tutor_id','student_id','course_id','amount_cents','paid','paid_at','created_at'] },
  TutorPayout:       { displayName:'Tutor Payouts',      keyFields:['id','tutor_id','amount_cents','method','paid_at','created_at'] },
  Certification:     { displayName:'Certifications',     keyFields:['id','student_id','tutor_id','course_id','status','completion_date','created_at'] },
  OnboardingRequest: { displayName:'Onboarding Requests',keyFields:['id','student_id','status','assigned_tutor_id','created_at'] },
  TutorProfile:      { displayName:'Tutor Profiles',     keyFields:['id','tutor_id','experience_years','rating','review_count','pay_rate_cents','created_at'] },
  TutorBankingDetails:{ displayName:'Banking Details',   keyFields:['id','tutor_id','account_holder_name','preferred_method','verified','created_at'] },
  Notification:      { displayName:'Notifications',      keyFields:['id','user_id','title','type','read','email_sent','created_at'] },
  TutorReview:       { displayName:'Tutor Reviews',      keyFields:['id','tutor_id','student_id','rating','review_text','created_at'] },
}

const TABLE_INCLUDES = {
  Payment:           { student: { select:{ first_name:true, last_name:true, email:true } } },
  Enrollment:        { student: { select:{ first_name:true, last_name:true, email:true } }, course: { select:{ title:true } } },
  SupportTicket:     { student: { select:{ first_name:true, last_name:true, email:true } } },
  AuditLog:          { actor:   { select:{ first_name:true, last_name:true, email:true } } },
  TutorFee:          { tutor:   { select:{ first_name:true, last_name:true } }, student: { select:{ first_name:true, last_name:true } }, course: { select:{ title:true } } },
  TutorPayout:       { tutor:   { select:{ first_name:true, last_name:true, email:true } } },
  Certification:     { student: { select:{ first_name:true, last_name:true } }, tutor: { select:{ first_name:true, last_name:true } }, course: { select:{ title:true } } },
  OnboardingRequest: { student: { select:{ first_name:true, last_name:true, email:true } }, assigned_tutor: { select:{ first_name:true, last_name:true } } },
  TutorProfile:      { tutor:   { select:{ first_name:true, last_name:true, email:true } } },
  TutorBankingDetails:{ tutor:  { select:{ first_name:true, last_name:true, email:true } } },
  Notification:      { recipient: { select:{ first_name:true, last_name:true, email:true } } },
  TutorReview:       { tutor:   { select:{ first_name:true, last_name:true } }, student: { select:{ first_name:true, last_name:true } } },
}

function buildWhere(filters = []) {
  if (!filters.length) return {}
  const conditions = filters.map(({ field, operator, value }) => {
    if (!field || !operator) return null
    switch (operator) {
      case 'equals':   return { [field]: { equals: value } }
      case 'contains': return { [field]: { contains: value, mode: 'insensitive' } }
      case 'gt':       return { [field]: { gt: value } }
      case 'lt':       return { [field]: { lt: value } }
      case 'gte':      return { [field]: { gte: value } }
      case 'lte':      return { [field]: { lte: value } }
      case 'in':       return { [field]: { in: Array.isArray(value) ? value : [value] } }
      case 'not':      return { [field]: { not: value } }
      default: return null
    }
  }).filter(Boolean)
  return conditions.length ? { AND: conditions } : {}
}

export const getTables = async (req, res) => {
  try {
    const tables = ALLOWED.map(name => ({ name, ...TABLE_META[name] }))
    return res.json({ success: true, data: { tables } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

export const queryTable = async (req, res) => {
  try {
    const { table, filters = [], sort, pagination = {}, columns } = req.body
    if (!ALLOWED.includes(table)) return res.status(400).json({ success: false, error: 'Table not allowed' })

    const delegate = prisma[MODEL_KEY[table]]
    const { page = 1, pageSize = 25 } = pagination
    const safePage     = Math.max(1, Number(page))
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize)))

    // Tables that don't have created_at — map to their timestamp equivalent
    const DEFAULT_SORT_FIELD = { Enrollment: 'enrolled_at' }
    const where   = buildWhere(filters)
    const sortDefault = DEFAULT_SORT_FIELD[table] || 'created_at'
    const orderBy = sort?.field
      ? { [sort.field]: sort.direction === 'asc' ? 'asc' : 'desc' }
      : { [sortDefault]: 'desc' }
    const include = TABLE_INCLUDES[table] || undefined

    const [total, rows] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({
        where,
        orderBy,
        skip:  (safePage - 1) * safePageSize,
        take:  safePageSize,
        include,
      }),
    ])

    return res.json({
      success: true,
      data: {
        rows,
        total,
        page:       safePage,
        pageSize:   safePageSize,
        totalPages: Math.ceil(total / safePageSize),
      },
    })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

export const getAnalytics = async (req, res) => {
  try {
    const now     = new Date()
    const ago30   = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [
      userTotal, userByRole, userSuspended, userNew30,
      paymentTotal, paymentSum, paymentAvg, paymentByStatus, paymentRevenue30,
      enrollTotal, enrollByStatus,
      ticketTotal, ticketByStatus, ticketByPriority, ticketOpen,
      feeTotal, feePaidSum, feeUnpaidSum,
      payoutTotal, payoutSum,
      onboardTotal, onboardByStatus,
      certByStatus,
      courseCount, moduleCount, planCount, notifCount, auditCount,
      certCount, reviewCount, tutorProfileCount, bankCount,
    ] = await Promise.all([
      // User
      prisma.user.count(),
      prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
      prisma.user.count({ where: { suspended: true } }),
      prisma.user.count({ where: { created_at: { gte: ago30 } } }),
      // Payment
      prisma.payment.count(),
      prisma.payment.aggregate({ _sum: { amount_cents: true }, where: { status: 'succeeded' } }),
      prisma.payment.aggregate({ _avg: { amount_cents: true }, where: { status: 'succeeded' } }),
      prisma.payment.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.payment.aggregate({ _sum: { amount_cents: true }, where: { status: 'succeeded', created_at: { gte: ago30 } } }),
      // Enrollment
      prisma.enrollment.count(),
      prisma.enrollment.groupBy({ by: ['status'], _count: { id: true } }),
      // SupportTicket
      prisma.supportTicket.count(),
      prisma.supportTicket.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.supportTicket.groupBy({ by: ['priority'], _count: { id: true } }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
      // TutorFee
      prisma.tutorFee.count(),
      prisma.tutorFee.aggregate({ _sum: { amount_cents: true }, where: { paid: true } }),
      prisma.tutorFee.aggregate({ _sum: { amount_cents: true }, where: { paid: false } }),
      // TutorPayout
      prisma.tutorPayout.count(),
      prisma.tutorPayout.aggregate({ _sum: { amount_cents: true } }),
      // OnboardingRequest
      prisma.onboardingRequest.count(),
      prisma.onboardingRequest.groupBy({ by: ['status'], _count: { id: true } }),
      // Certification
      prisma.certification.groupBy({ by: ['status'], _count: { id: true } }),
      // Simple counts
      prisma.course.count(), prisma.module.count(), prisma.plan.count(),
      prisma.notification.count(), prisma.auditLog.count(),
      prisma.certification.count(), prisma.tutorReview.count(),
      prisma.tutorProfile.count(), prisma.tutorBankingDetails.count(),
    ])

    const toMap = (grouped, field) =>
      Object.fromEntries(grouped.map(g => [g[field], g._count.id]))

    const analytics = {
      User: {
        total: userTotal,
        by_role: toMap(userByRole, 'role'),
        suspended: userSuspended,
        new_last_30d: userNew30,
      },
      Payment: {
        total: paymentTotal,
        total_revenue_cents: paymentSum._sum.amount_cents || 0,
        avg_amount_cents: Math.round(paymentAvg._avg.amount_cents || 0),
        by_status: toMap(paymentByStatus, 'status'),
        revenue_last_30d_cents: paymentRevenue30._sum.amount_cents || 0,
      },
      Enrollment: {
        total: enrollTotal,
        by_status: toMap(enrollByStatus, 'status'),
      },
      SupportTicket: {
        total: ticketTotal,
        by_status: toMap(ticketByStatus, 'status'),
        by_priority: toMap(ticketByPriority, 'priority'),
        open: ticketOpen,
      },
      TutorFee: {
        total: feeTotal,
        paid_sum_cents: feePaidSum._sum.amount_cents || 0,
        unpaid_sum_cents: feeUnpaidSum._sum.amount_cents || 0,
      },
      TutorPayout: {
        total: payoutTotal,
        total_paid_cents: payoutSum._sum.amount_cents || 0,
      },
      OnboardingRequest: {
        total: onboardTotal,
        by_status: toMap(onboardByStatus, 'status'),
      },
      Certification: {
        total: certCount,
        by_status: toMap(certByStatus, 'status'),
      },
      Course: { total: courseCount },
      Module: { total: moduleCount },
      Plan: { total: planCount },
      Notification: { total: notifCount },
      AuditLog: { total: auditCount },
      TutorReview: { total: reviewCount },
      TutorProfile: { total: tutorProfileCount },
      TutorBankingDetails: { total: bankCount },
    }

    return res.json({ success: true, data: { analytics } })
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}

export const exportTable = async (req, res) => {
  try {
    const { table } = req.params
    if (!ALLOWED.includes(table)) return res.status(400).json({ success: false, error: 'Table not allowed' })

    let filters = [], sort
    try { filters = JSON.parse(req.query.filters || '[]') } catch {}
    try { sort    = JSON.parse(req.query.sort    || 'null') } catch {}

    const delegate = prisma[MODEL_KEY[table]]
    const where    = buildWhere(filters)
    const orderBy  = sort?.field ? { [sort.field]: sort.direction === 'asc' ? 'asc' : 'desc' } : { created_at: 'desc' }

    const rows = await delegate.findMany({ where, orderBy, take: 10000 })

    if (!rows.length) {
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`)
      return res.send('')
    }

    const headers = Object.keys(rows[0])
    const escape  = v => {
      if (v === null || v === undefined) return ''
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }

    const lines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => escape(r[h])).join(','))
    ]

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${table}-export.csv"`)
    return res.send(lines.join('\n'))
  } catch (e) {
    return res.status(500).json({ success: false, error: safeError(e) })
  }
}
