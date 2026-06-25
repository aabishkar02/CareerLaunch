// Mutable singleton shared between server.js and auth.middleware.js.
// server.js writes `startedAt` once at boot; auth.middleware.js reads it
// to reject any access token issued before the current process started.
export const serverState = {
  startedAt: 0,
}
