import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.middleware.js'
import { validate, createIntentSchema, confirmPaymentSchema, createManagedIntentSchema } from '../middleware/validate.middleware.js'
import {
  createPaymentIntent,
  confirmPayment,
  stripeWebhook,
  getPaymentHistory,
  adminGetPayments,
  adminRefundPayment,
  createManagedPlanIntent,
  confirmManagedPayment,
  getStudentReceipt,
} from '../controllers/payment.controller.js'

const router = Router()

// ── Stripe webhook — MUST be before express.json() middleware
// Raw body needed for signature verification
// Register this route in server.js BEFORE app.use(express.json())
router.post(
  '/webhook',
  stripeWebhook   // raw body handled by express.raw() in server.js
)

// ── Student routes ───────────────────────────────────────────
router.post('/create-intent',         protect, authorize('student'), validate(createIntentSchema),        createPaymentIntent)
router.post('/confirm',               protect, authorize('student'), validate(confirmPaymentSchema),       confirmPayment)
router.post('/create-managed-intent', protect, authorize('student'), validate(createManagedIntentSchema), createManagedPlanIntent)
router.post('/confirm-managed',       protect, authorize('student'), validate(confirmPaymentSchema),       confirmManagedPayment)
router.get('/history',                protect, authorize('student'), getPaymentHistory)
router.get('/receipt/:id',            protect, authorize('student'), getStudentReceipt)

// ── Admin routes ─────────────────────────────────────────────
router.get('/admin',              protect, authorize('admin'), adminGetPayments)
router.post('/admin/:id/refund',  protect, authorize('admin'), adminRefundPayment)

export default router