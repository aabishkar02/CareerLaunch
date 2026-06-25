import { prisma } from '../config/db.js'

// ─── Get all tutor fee records (admin) ────────────────────────
// GET /api/v1/admin/tutor-fees
export const getTutorFees = async (req, res) => {
  try {
    const { tutorId, paid } = req.query
    const where = {}
    if (tutorId) where.tutor_id = tutorId
    if (paid !== undefined) where.paid = paid === 'true'

    const fees = await prisma.tutorFee.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        tutor:   { select: { id:true, first_name:true, last_name:true, email:true } },
        student: { select: { id:true, first_name:true, last_name:true, email:true } },
        course:  { select: { id:true, title:true, slug:true } },
        admin:   { select: { id:true, first_name:true, last_name:true } },
      },
    })

    // Summary stats
    const totalOwed = fees.filter(f => !f.paid).reduce((s, f) => s + f.amount_cents, 0)
    const totalPaid = fees.filter(f =>  f.paid).reduce((s, f) => s + f.amount_cents, 0)

    return res.json({
      success: true,
      data: { fees, total_owed: totalOwed, total_paid: totalPaid },
    })
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message })
  }
}

// ─── Create fee record when tutor is assigned ─────────────────
// POST /api/v1/admin/tutor-fees
export const createTutorFee = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { tutor_id, student_id, course_id, assignment_id, amount_cents, start_date, notes } = req.body

    if (!tutor_id || !student_id || !course_id || !start_date) {
      return res.status(400).json({
        success: false,
        error: 'tutor_id, student_id, course_id and start_date are required',
      })
    }

    // Check if fee already exists for this combo
    const existing = await prisma.tutorFee.findFirst({
      where: { tutor_id, student_id, course_id },
    })
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Fee record already exists for this tutor/student/course combination',
      })
    }

    const fee = await prisma.tutorFee.create({
      data: {
        tutor_id,
        student_id,
        course_id,
        assignment_id: assignment_id || null,
        amount_cents:  amount_cents || 0,
        start_date:    new Date(start_date),
        notes:         notes || null,
        paid:          false,
      },
      include: {
        tutor:   { select: { id:true, first_name:true, last_name:true } },
        student: { select: { id:true, first_name:true, last_name:true } },
        course:  { select: { id:true, title:true } },
      },
    })

    return res.status(201).json({ success:true, data:{ fee } })
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message })
  }
}

// ─── Mark fee as paid ─────────────────────────────────────────
// PATCH /api/v1/admin/tutor-fees/:id/pay
export const markFeePaid = async (req, res) => {
  try {
    const adminId = req.user.userId
    const { id }  = req.params
    const { notes } = req.body

    const fee = await prisma.tutorFee.findUnique({
      where:   { id },
      include: {
        tutor:   { select: { id:true, first_name:true, last_name:true, email:true } },
        student: { select: { id:true, first_name:true, last_name:true } },
        course:  { select: { id:true, title:true } },
      },
    })

    if (!fee) return res.status(404).json({ success:false, error:'Fee record not found' })

    const updated = await prisma.tutorFee.update({
      where: { id },
      data: {
        paid:    true,
        paid_at: new Date(),
        paid_by: adminId,
        notes:   notes || fee.notes,
      },
    })

    // Notify tutor
    await prisma.notification.create({
      data: {
        user_id: fee.tutor_id,
        title:   'Payment received',
        message: `You have been paid for tutoring ${fee.student.first_name} ${fee.student.last_name} on the course "${fee.course.title}". Start date: ${new Date(fee.start_date).toLocaleDateString()}.`,
        type:    'info',
        sent_by: adminId,
      },
    })

    // Audit
    await prisma.auditLog.create({
      data: {
        actor_id:    adminId,
        action:      'tutor_fee.paid',
        entity_type: 'tutor_fee',
        entity_id:   id,
        new_value:   { tutor_id:fee.tutor_id, student_id:fee.student_id, course_id:fee.course_id, amount_cents:fee.amount_cents },
      },
    })

    return res.json({ success:true, data:{ fee:updated } })
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message })
  }
}

// ─── Update fee amount ────────────────────────────────────────
// PATCH /api/v1/admin/tutor-fees/:id
export const updateTutorFee = async (req, res) => {
  try {
    const { id } = req.params
    const { amount_cents, notes, start_date } = req.body

    const fee = await prisma.tutorFee.update({
      where: { id },
      data: {
        ...(amount_cents !== undefined && { amount_cents }),
        ...(notes       !== undefined && { notes }),
        ...(start_date  !== undefined && { start_date: new Date(start_date) }),
      },
    })

    return res.json({ success:true, data:{ fee } })
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message })
  }
}

// ─── Get assignments with fee status (admin overview) ─────────
// GET /api/v1/admin/assignments-with-fees
export const getAssignmentsWithFees = async (req, res) => {
  try {
    const assignments = await prisma.studentTutorAssignment.findMany({
      where:   { status: 'active' },
      orderBy: { start_date: 'desc' },
      include: {
        student: { select:{ id:true, first_name:true, last_name:true, email:true } },
        tutor:   { select:{ id:true, first_name:true, last_name:true, email:true } },
        tutor_fees: {
          include: {
            course: { select:{ id:true, title:true } },
          },
        },
      },
    })

    return res.json({ success:true, data:{ assignments } })
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message })
  }
}