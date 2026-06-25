import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'
import { browserTz } from '../utils/timezone'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  // Auto-save browser timezone when user has none stored yet
  const syncTimezone = async (u) => {
    if (u && !u.timezone) {
      const tz = browserTz()
      try {
        await api.patch('/auth/me', { timezone: tz })
        setUser(prev => prev ? { ...prev, timezone: tz } : prev)
      } catch {
        // Non-critical — timezone can be set manually later
      }
    }
  }

  useEffect(() => {
    const restore = async () => {
      // Skip the refresh round-trip entirely for visitors who have never logged
      // in. Without this, every first-time/guest page load fires a guaranteed
      // 401 (plus the interceptor's retry), which is noise and slows first paint.
      if (!localStorage.getItem('hasSession')) {
        setLoading(false)
        return
      }
      try {
        // Refresh token is an httpOnly cookie — no localStorage needed.
        // A 401 here means the session genuinely expired (not a network blip,
        // because the interceptor would have already retried once).
        await api.post('/auth/refresh')
        const me = await api.get('/auth/me')
        const u  = me.data.data.user
        setUser(u)
        syncTimezone(u)
      } catch (err) {
        // Only clear state for auth failures (401/403); ignore network errors
        if (err.response?.status === 401 || err.response?.status === 403) {
          setUser(null)
          localStorage.removeItem('hasSession')
        }
        // For network errors, leave user as null but don't treat as logged-out
      } finally {
        setLoading(false)
      }
    }
    restore()
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const u = res.data.data.user
    setUser(u)
    localStorage.setItem('hasSession', '1')
    syncTimezone(u)
    return u
  }

  const register = async (data) => {
    const res = await api.post('/auth/register', data)
    if (res.data.data.pendingApproval) {
      return { ...res.data.data.user, pendingApproval: true }
    }
    const u = res.data.data.user
    setUser(u)
    localStorage.setItem('hasSession', '1')
    syncTimezone(u)
    return u
  }

  const updateTimezone = async (tz) => {
    try {
      await api.patch('/auth/me', { timezone: tz })
      setUser(prev => prev ? { ...prev, timezone: tz } : prev)
    } catch (err) {
      throw err // let the calling component show an error
    }
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch {}
    setUser(null)
    localStorage.removeItem('hasSession')
  }

  const getRedirect = (user) => {
    if (user.role === 'admin') return '/admin'
    if (user.role === 'tutor') return '/tutor'
    return '/dashboard'
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser, getRedirect, updateTimezone }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
