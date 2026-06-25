import { z } from 'zod'

// Wraps a Zod schema into an Express middleware.
// Validates req.body and attaches the parsed (trimmed/coerced) result back to req.body.
// On failure, responds 400 with the first error message.
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    // Zod v4 exposes issues on `.issues` (`.errors` was removed). Guard both
    // so a validation failure never crashes into a 500.
    const issues = result.error?.issues || result.error?.errors || []
    const message = issues[0]?.message || 'Invalid request data.'
    return res.status(400).json({ success: false, error: message })
  }
  req.body = result.data
  next()
}

// ─── Auth schemas ─────────────────────────────────────────────

export const loginSchema = z.object({
  email:    z.string().email('Invalid email address.').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required.'),
})

export const registerSchema = z.object({
  first_name: z.string().min(1, 'First name is required.').max(100).trim(),
  last_name:  z.string().min(1, 'Last name is required.').max(100).trim(),
  email:      z.string().email('Invalid email address.').toLowerCase().trim(),
  password:   z.string().min(8, 'Password must be at least 8 characters.').max(128),
  // Public self-registration is restricted to student/tutor only.
  // Admin accounts are provisioned internally, never via this endpoint.
  role:       z.enum(['student', 'tutor'], { message: 'Role must be student or tutor.' }),
  phone:      z.string().max(30).trim().optional(),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address.').toLowerCase().trim(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword:     z.string().min(8, 'New password must be at least 8 characters.').max(128),
  confirmPassword: z.string().min(1, 'Password confirmation is required.'),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'New passwords do not match.',
  path:    ['confirmPassword'],
})

export const resetPasswordSchema = z.object({
  token:           z.string().min(1, 'Reset token is required.'),
  password:        z.string().min(8, 'Password must be at least 8 characters.').max(128),
  confirmPassword: z.string().min(1, 'Password confirmation is required.'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match.',
  path:    ['confirmPassword'],
})

// ─── Payment schemas ──────────────────────────────────────────

export const createIntentSchema = z.object({
  courseId:          z.string().uuid('Invalid course ID.'),
  planType:          z.string().min(1, 'planType is required.'),
  couponCode:        z.string().max(50).trim().optional(),
  moduleOrderIndex:  z.number().int().positive().optional().nullable(),
})

export const confirmPaymentSchema = z.object({
  paymentIntentId: z.string().min(1, 'paymentIntentId is required.'),
})

export const createManagedIntentSchema = z.object({
  planId:           z.string().uuid('Invalid plan ID.'),
  couponCode:       z.string().max(50).trim().optional(),
  selectedModuleId: z.string().uuid().optional().nullable(),
})
