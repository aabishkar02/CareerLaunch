export const errorHandler = (err, req, res, next) => {
  // Avoid leaking internal details in production
  const isProd = process.env.NODE_ENV === 'production';

  // Determine HTTP status — prefer err.status, fall back to 500
  const status = err.status || err.statusCode || 500;

  // Prisma known-request errors (P2002 = unique constraint, P2025 = not found, etc.)
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error:   'A record with that value already exists.',
    });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error:   'Record not found.',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, error: 'Invalid token.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, error: 'Token expired.' });
  }

  // Validation errors (Zod, manual)
  if (err.name === 'ValidationError' || err.status === 400) {
    return res.status(400).json({
      success: false,
      error:   err.message || 'Invalid request data.',
    });
  }

  // Log unexpected errors server-side only
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${err.message}`, err.stack);
  }

  return res.status(status).json({
    success: false,
    error:   isProd && status >= 500 ? 'Internal server error.' : err.message,
  });
};
