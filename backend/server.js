import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { initSocket } from './src/config/socket.js';
import cookieParser from 'cookie-parser';
import { apiLimiter } from './src/middleware/rateLimiter.middleware.js';
import { prisma } from './src/config/db.js';

// Middleware to parse cookies


import { errorHandler } from './src/middleware/errorHandler.middleware.js';
import routes from './src/routes/index.js';

const app = express();

app.use('/api/v1/payments/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    req.rawBody = req.body
    next()
  }
);

app.use(cookieParser());
const httpServer = createServer(app);

// ─── Security middleware ─────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", 'https://js.stripe.com'],
      frameSrc:    ["'self'", 'https://js.stripe.com'],
      connectSrc:  ["'self'", 'https://api.stripe.com'],
      imgSrc:      ["'self'", 'data:', 'https:'],
      styleSrc:    ["'self'", "'unsafe-inline'"], // inline styles used in emails/React
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Stripe embeds require this
}));
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow server-to-server / same-origin (no Origin header)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      // Reject cleanly (no CORS headers) instead of throwing, which would surface
      // as a generic 500 and pollute the error logs.
      if (process.env.NODE_ENV !== 'production') console.warn(`CORS: origin ${origin} not allowed`);
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Body parsers ────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── General rate limit — applied to all routes ──────────────
app.use(apiLimiter);

// ─── Health check (before auth middleware) ───────────────────
app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── All API routes ──────────────────────────────────────────
app.use('/api/v1', routes);

// ─── 404 handler (after all routes) ─────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global error handler (must be last) ────────────────────
app.use(errorHandler);

// ─── WebSocket ───────────────────────────────────────────────
initSocket(httpServer);

// ─── Start server ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
});

// ─── Graceful shutdown ───────────────────────────────────────
const shutdown = (signal) => {
  console.info(`\n${signal} received — shutting down gracefully`);
  httpServer.close(() => {
    console.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Session invalidation on restart ─────────────────────────
// Record the boot time in Unix seconds. The auth middleware rejects any
// access token whose `iat` is earlier than this, so every token issued
// before this restart is immediately invalid — users must log in again.
import { serverState } from './src/config/serverState.js'
serverState.startedAt = Math.floor(Date.now() / 1000)

// Revoke every refresh token so the refresh endpoint also forces re-login.
// Fire-and-forget at boot; a failure here is logged but never crashes startup.
;(async () => {
  try {
    const { count } = await prisma.refreshToken.updateMany({
      where:  { revoked: false },
      data:   { revoked: true },
    })
    if (count > 0) console.info(`[startup] Revoked ${count} refresh tokens — all users must log in again`)
  } catch (err) {
    console.error('[startup] Could not revoke refresh tokens on restart:', err.message)
  }
})()

// ─── Seed default email templates (once, idempotent) ─────────
;(async () => {
  const defaults = [
    {
      key: 'student_welcome',
      name: 'Student Welcome',
      subject: 'Welcome to Career Launch',
      preheader: "Welcome to Career Launch — here's how to get started.",
      heading: 'Welcome, {{firstName}}.',
      intro: "Your account is ready. Career Launch pairs you with a dedicated mentor for focused, one-on-one sessions — never a crowded cohort. Here's how to get going:",
      steps: [
        { title: 'Browse modules and plans', body: 'Explore the curriculum and pick the plan that matches your goals.' },
        { title: 'Purchase to unlock session credits', body: 'Each credit equals one 70-minute one-on-one session. Credits never expire.' },
        { title: "Book a session with your mentor", body: "Choose an open slot on your tutor's calendar — times show in your own timezone." },
        { title: 'Join and learn', body: 'Your tutor adds a meeting link once they confirm. Track everything from your dashboard.' },
      ],
      cta_label: 'Go to your dashboard',
    },
    {
      key: 'tutor_welcome',
      name: 'Tutor Welcome',
      subject: 'Your Career Launch tutor account is approved',
      preheader: "Your tutor account is approved — here's how to start mentoring.",
      heading: "You're approved, {{firstName}}.",
      intro: 'Your tutor account has been approved and you can now start mentoring on Career Launch. A few steps to set yourself up:',
      steps: [
        { title: 'Complete your tutor profile', body: "Add your bio, expertise, and timezone so students know who they're booking." },
        { title: 'Set your weekly availability', body: "Open the calendar and mark the hours you're available. Students can only book inside these windows." },
        { title: 'Confirm bookings and add meeting links', body: 'When a student requests a session, confirm it and attach your meeting link.' },
        { title: 'Mark sessions complete', body: "Completing a session logs your hours and deducts the student's credit automatically." },
      ],
      cta_label: 'Go to your tutor dashboard',
    },
  ]
  try {
    for (const tpl of defaults) {
      await prisma.emailTemplate.upsert({
        where:  { key: tpl.key },
        update: {},
        create: tpl,
      })
    }
  } catch (err) {
    console.error('[startup] Could not seed email templates:', err.message)
  }
})()

// ─── Refresh token cleanup ────────────────────────────────────
// Purge revoked/expired rows every 24 hours to keep the table lean.
async function purgeExpiredRefreshTokens() {
  try {
    const { count } = await prisma.refreshToken.deleteMany({
      where: { OR: [{ revoked: true }, { expires_at: { lt: new Date() } }] },
    })
    if (count > 0) console.info(`[cleanup] Purged ${count} expired/revoked refresh tokens`)
  } catch (err) {
    console.error('[cleanup] Refresh token purge failed:', err.message)
  }
}
setInterval(purgeExpiredRefreshTokens, 24 * 60 * 60 * 1000)

// Catch unhandled errors so the server never silently dies
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

export default app;