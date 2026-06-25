import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import { getTables, queryTable, getAnalytics as getExplorerAnalytics, exportTable } from '../controllers/dataExplorer.controller.js'
import { getTutorFees, createTutorFee, markFeePaid, updateTutorFee, getAssignmentsWithFees } from '../controllers/tutorFee.controller.js'
import {
  adminGetBanking,
  adminVerifyBanking,
  adminGetPayouts,
  adminGetPayout,
  adminRecordPayout,
} from '../controllers/tutorBanking.controller.js'
import {
  getStats,
  getUsers,
  getUserDetail,
  suspendUser,
  deleteUser,
  assignTutor,
  getTutorHours,
  getTutorCalendarAdmin,
  getEnrollments,
  getSessions,
  getPayments,
  getAuditLog,
  postMeetingLink,
  assignTutorToCourse,
  removeTutorFromCourse,
  assignTutorToEnrollment,
  getModuleTutors,
  assignTutorToModule,
  removeTutorFromModule,
  assignTutorToModuleEnrollment,
  getModuleEnrollments,
  getAllModules,
  updateModule,
  getStudentCredits,
  refundModuleCredits,
  getTutorStats,
  getPaymentById,
  getPayroll,
  paySession,
  updateTutorPayRate,
  getAnalytics,
  getStudentDetail,
  adjustCredits,
  // New
  getTutorSessions,
  bulkPaySessions,
  adminGetSupportTickets,
  adminReplyToSupportTicket,
  broadcastNotification,
  getPaymentRecords,
  getTutorDetail,
  getPendingTutors,
  approveTutor,
  rejectTutor,
  getDatabaseSchema,
  adminGetCertifications,
  adminCreateCertification,
  adminIssueCertification,
  adminRejectCertification,
  adminBackfillCertifications,
} from '../controllers/admin.controller.js'

import {
  adminGetTickets,
  adminReplyToTicket,
} from '../controllers/support.controller.js'

import { adminRefundPayment } from '../controllers/payment.controller.js'
import { getEmailTemplates, getEmailTemplate, updateEmailTemplate } from '../controllers/emailTemplate.controller.js'
import { getTutorPayrollWeeks } from '../controllers/weeklyPayroll.controller.js'
import {
  getPayrollWeeks,
  createWeeklyPayment,
  createWeekAllPayment,
  getPayrollActivity,
  markPaymentDone,
} from '../controllers/weeklyPayroll.controller.js'

const router = Router()
const guard  = [protect, authorize('admin')]

// ── Tutor approval ────────────────────────────────────────────
router.get('/tutors/pending',           ...guard, getPendingTutors)
router.patch('/tutors/:id/approve',     ...guard, approveTutor)
router.patch('/tutors/:id/reject',      ...guard, rejectTutor)

// ── Stats ─────────────────────────────────────────────────────
router.get('/stats',                    ...guard, getStats)

// ── Users ─────────────────────────────────────────────────────
router.get('/users',                    ...guard, getUsers)
router.get('/users/:id',                ...guard, getUserDetail)
router.patch('/users/:id/suspend',      ...guard, suspendUser)
router.delete('/users/:id',             ...guard, deleteUser)

// ── Tutor assignment ──────────────────────────────────────────
router.post('/assign-tutor',            ...guard, assignTutor)

// ── Tutor hours & calendar ────────────────────────────────────
router.get('/tutors/hours',             ...guard, getTutorHours)
router.get('/tutors/:id/stats',         ...guard, getTutorStats)
router.get('/tutors/:id/calendar',      ...guard, getTutorCalendarAdmin)

// ── Enrollments ───────────────────────────────────────────────
router.get('/enrollments',              ...guard, getEnrollments)

// ── Sessions ──────────────────────────────────────────────────
router.get('/sessions',                 ...guard, getSessions)

// ── Payments ──────────────────────────────────────────────────
router.get('/payments',                 ...guard, getPayments)
router.get('/payments/:id',             ...guard, getPaymentById)

// ── Audit log ─────────────────────────────────────────────────
router.get('/audit',                    ...guard, getAuditLog)

// ── Meeting links ─────────────────────────────────────────────
router.post('/meetings',                ...guard, postMeetingLink)

router.get('/tutor-fees',            ...guard, getTutorFees)
router.post('/tutor-fees',           ...guard, createTutorFee)
router.patch('/tutor-fees/:id/pay',  ...guard, markFeePaid)
router.patch('/tutor-fees/:id',      ...guard, updateTutorFee)
router.get('/assignments-with-fees', ...guard, getAssignmentsWithFees)

// ── Course-tutor management ───────────────────────────────────
router.post('/courses/:courseId/tutors',              ...guard, assignTutorToCourse)
router.delete('/courses/:courseId/tutors/:tutorId',   ...guard, removeTutorFromCourse)
router.post('/enrollments/:enrollmentId/assign-tutor',...guard, assignTutorToEnrollment)

// ── Module management ─────────────────────────────────────────
router.get('/modules',                                           ...guard, getAllModules)
router.patch('/modules/:moduleId',                               ...guard, updateModule)
router.get('/modules/:moduleId/tutors',                  ...guard, getModuleTutors)
router.post('/modules/:moduleId/tutors',                 ...guard, assignTutorToModule)
router.delete('/modules/:moduleId/tutors/:tutorId',      ...guard, removeTutorFromModule)
router.post('/module-enrollments/:id/assign-tutor',      ...guard, assignTutorToModuleEnrollment)
router.get('/module-enrollments',                        ...guard, getModuleEnrollments)
router.get('/students/:studentId/credits',                          ...guard, getStudentCredits)
router.post('/students/:studentId/modules/:moduleId/refund-credits', ...guard, refundModuleCredits)
router.get('/students/:studentId',                                   ...guard, getStudentDetail)
router.post('/students/:studentId/modules/:moduleId/credits',        ...guard, adjustCredits)

// ── Weekly Payroll (new) ──────────────────────────────────────
router.get('/payroll/weeks',                              ...guard, getPayrollWeeks)
router.post('/payroll/pay/weekly',                        ...guard, createWeeklyPayment)
router.post('/payroll/pay/week-all',                      ...guard, createWeekAllPayment)
router.get('/payroll/activity',                           ...guard, getPayrollActivity)
router.patch('/payroll/activity/:paymentId/done',         ...guard, markPaymentDone)

// ── Payroll (legacy — session-level pay) ──────────────────────
router.get('/payroll',                                    ...guard, getPayroll)
router.patch('/payroll/sessions/:sessionId/pay',          ...guard, paySession)
router.patch('/tutors/:tutorId/pay-rate',                 ...guard, updateTutorPayRate)

// ── Analytics ─────────────────────────────────────────────────
router.get('/analytics',                                  ...guard, getAnalytics)

// ── Tutor sessions (for payroll view) ────────────────────────
router.get('/tutor-sessions',                             ...guard, getTutorSessions)

// ── Bulk payroll pay ──────────────────────────────────────────
router.post('/payroll/pay',                               ...guard, bulkPaySessions)

// ── Support tickets (admin alias paths) ──────────────────────
router.get('/support-tickets',                            ...guard, adminGetSupportTickets)
router.post('/support-tickets/:id/reply',                 ...guard, adminReplyToSupportTicket)

// ── Notification broadcast ────────────────────────────────────
router.post('/notifications/broadcast',                   ...guard, broadcastNotification)

// ── Payment refund ────────────────────────────────────────────
router.post('/payments/:id/refund',                       ...guard, adminRefundPayment)

// ── Payment records ───────────────────────────────────────────
router.get('/payment-records',                            ...guard, getPaymentRecords)

// ── Certifications ────────────────────────────────────────────
router.get( '/certifications',              ...guard, adminGetCertifications)
router.post('/certifications',              ...guard, adminCreateCertification)
router.post('/certifications/backfill',     ...guard, adminBackfillCertifications)
router.patch('/certifications/:id/issue',   ...guard, adminIssueCertification)
router.patch('/certifications/:id/reject',  ...guard, adminRejectCertification)

// ── Database schema ───────────────────────────────────────────
router.get('/schema',                                     ...guard, getDatabaseSchema)

// ── Data Explorer ─────────────────────────────────────────────
router.get( '/explorer/tables',        ...guard, getTables)
router.post('/explorer/query',         ...guard, queryTable)
router.get( '/explorer/analytics',     ...guard, getExplorerAnalytics)
router.get( '/explorer/export/:table', ...guard, exportTable)

// ── Tutor detail ──────────────────────────────────────────────
router.get('/tutors/:id/payroll/weeks',                   ...guard, getTutorPayrollWeeks)
router.get('/tutors/:id/detail',                          ...guard, getTutorDetail)

// ── Tutor banking details ─────────────────────────────────────
router.get( '/tutors/:id/banking',                        ...guard, adminGetBanking)
router.post('/tutors/:id/banking/verify',                 ...guard, adminVerifyBanking)

// ── Tutor payouts ─────────────────────────────────────────────
router.get( '/tutors/:id/payouts',                        ...guard, adminGetPayouts)
router.post('/tutors/:id/payouts',                        ...guard, adminRecordPayout)
router.get( '/tutors/:id/payouts/:payoutId',              ...guard, adminGetPayout)

// ── Email templates ───────────────────────────────────────────
router.get( '/email-templates',      ...guard, getEmailTemplates)
router.get( '/email-templates/:key', ...guard, getEmailTemplate)
router.patch('/email-templates/:key', ...guard, updateEmailTemplate)

export default router