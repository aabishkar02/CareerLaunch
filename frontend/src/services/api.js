import axios from 'axios'
import { toast } from './toast'

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // sends httpOnly cookies (accessToken + refreshToken)
})

let isRefreshing = false
let queue = []

const processQueue = (error) => {
  queue.forEach(p => error ? p.reject(error) : p.resolve())
  queue = []
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    const isAuthEndpoint = original.url?.includes('/auth/')
    if (err.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject })
        }).then(() => api(original)).catch(e => Promise.reject(e))
      }
      isRefreshing = true
      try {
        // Refresh token is an httpOnly cookie — no body needed
        await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
        processQueue(null)
        return api(original)
      } catch (e) {
        processQueue(e)
        // Only redirect if this was a genuine auth failure (not a network blip)
        if (e.response?.status === 401 || e.response?.status === 403) {
          localStorage.removeItem('hasSession')
          // Only hard-redirect from pages that actually require auth.
          // Public pages (plans, courses, landing, etc.) should stay put and
          // just let the API call fail — the page renders fine without auth.
          const path = window.location.pathname
          const requiresAuth = path.startsWith('/dashboard')
            || path.startsWith('/tutor')
            || path.startsWith('/admin')
            || path.startsWith('/checkout')
          if (requiresAuth) {
            const loginPath = path.startsWith('/admin') ? '/admin/login' : '/login'
            window.location.href = loginPath
          }
        }
        return Promise.reject(e)
      } finally {
        isRefreshing = false
      }
    }
    // For non-401 errors that were not retried, surface a toast so the user
    // isn't left staring at a broken page with no feedback.
    const status = err.response?.status
    if (status && status !== 401) {
      const message = err.response?.data?.error
        || err.response?.data?.message
        || (status >= 500 ? 'Server error. Please try again.' : 'Something went wrong.')
      toast.error(message)
    }

    return Promise.reject(err)
  }
)

export default api
