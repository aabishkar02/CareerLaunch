// Returns a safe error message: full message in dev/test, generic string in production.
// Use this in every catch block that returns a 500, to prevent leaking DB schema details,
// Prisma constraint names, or stack traces to clients.
export const safeError = (err) =>
  process.env.NODE_ENV === 'production'
    ? 'Internal server error.'
    : (err?.message || 'Internal server error.')
