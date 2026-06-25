import rateLimit from 'express-rate-limit';

// Strict limiter for auth endpoints (login, register, password reset)
// 10 attempts per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    error:   'Too many attempts. Please try again in 15 minutes.',
  },
  skipSuccessfulRequests: true, // only count failures toward the limit
});

// General API limiter — 200 req/min per IP
export const apiLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    error:   'Too many requests. Please slow down.',
  },
});
