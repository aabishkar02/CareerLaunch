// Lightweight cross-boundary toast — works from React components and the API interceptor.
// Emit:  toast.error('message') / toast.success('message') / toast.info('message')
// Render: mount <ToastContainer /> once at the app root.

const TOAST_EVENT = 'app:toast'

export const toast = {
  error:   (message) => dispatch('error',   message),
  success: (message) => dispatch('success', message),
  info:    (message) => dispatch('info',    message),
}

function dispatch(type, message) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { type, message, id: Date.now() } }))
}

export { TOAST_EVENT }
