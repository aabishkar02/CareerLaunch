import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import usePageTitle from '../../utils/usePageTitle'
import { ArrowRight, ArrowLeft, User, BookOpen } from 'lucide-react'

// ── Logo ────────────────────────────────────────────────────────
function Logo({ light = false, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: onClick ? 'pointer' : 'default', userSelect: 'none' }}>
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
        <path d="M16 1.5 19.4 12.6 30.5 16 19.4 19.4 16 30.5 12.6 19.4 1.5 16 12.6 12.6Z" fill="var(--accent)"/>
        <path d="M16 8.5 17.7 14.3 23.5 16 17.7 17.7 16 23.5 14.3 17.7 8.5 16 14.3 14.3Z" fill="white" opacity={light ? 0.9 : 0.82}/>
      </svg>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.03em', color: light ? '#fff' : 'var(--text)', whiteSpace: 'nowrap' }}>
        Career<span style={{ color: light ? 'rgba(255,255,255,.7)' : 'var(--accent)' }}>Launch</span>
      </span>
    </div>
  )
}

// ── Role definitions ────────────────────────────────────────────
// Single accent tint keeps the page on the design system's one-accent palette.
const TINT = { bg: 'var(--accent-light)', fg: 'var(--accent)' }
const ROLES = {
  student: {
    label: 'Student',
    Icon:  User,
    tint:  TINT,
    desc:  'Book sessions, track credits & materials',
  },
  tutor: {
    label: 'Tutor',
    Icon:  BookOpen,
    tint:  TINT,
    desc:  'Confirm requests, manage your courses',
  },
}

export default function Login() {
  usePageTitle('Sign in')
  const { login, logout, getRedirect } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [role, setRole]       = useState('student')
  const [form, setForm]       = useState({ email: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const redirect = location.state?.redirect || null
  const meta     = ROLES[role]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      // The selected portal must match the account's actual role — otherwise
      // "Continue as Tutor" would silently land a student on the student dashboard.
      if (user.role !== role) {
        await logout()
        // Admin isn't a public portal — don't hint that it exists or that the
        // credentials were valid; show the same message as a bad login.
        if (!ROLES[user.role]) {
          setError('Login failed. Check your email and password.')
        } else {
          setError(`This account is registered as a ${user.role}. Switch to the ${ROLES[user.role].label} portal to sign in.`)
        }
        return
      }
      if (redirect) { navigate(redirect, { state: location.state }); return }
      navigate(getRedirect(user))
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your email and password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '1fr 1fr' }} className="login-wrap">

      {/* ── Left: brand panel ───────────────────────────────────── */}
      <div className="login-aside" style={{
        position: 'relative', overflow: 'hidden',
        background: '#18171f', color: '#fff',
        padding: '48px 52px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        {/* glow orb */}
        <div style={{ position: 'absolute', top: '-15%', right: '-10%', width: 420, height: 420, background: 'radial-gradient(circle, rgba(124,92,255,.4), transparent 65%)', filter: 'blur(10px)', pointerEvents: 'none' }} />

        <Logo light onClick={() => navigate('/')} />

        <div style={{ position: 'relative' }}>
          <h2 style={{ fontSize: 38, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            One platform,<br />two points of view.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,.78)', marginTop: 16, maxWidth: 360, lineHeight: 1.6 }}>
            Students book and learn. Tutors mentor and confirm. Choose your portal to continue.
          </p>

          {/* role list — highlight active */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32 }}>
            {Object.entries(ROLES).map(([k, m]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: role === k ? 1 : 0.4, transition: 'opacity .2s', cursor: 'default' }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: m.tint.bg, color: m.tint.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <m.Icon size={19} strokeWidth={1.8} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.label}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)', marginTop: 1 }}>{m.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', fontSize: 13, color: 'rgba(255,255,255,.35)' }}>
          © 2026 CareerLaunch, Inc.
        </div>
      </div>

      {/* ── Right: form ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', placeItems: 'center', padding: '40px 32px', background: 'var(--bg)', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          <h1 style={{ fontSize: 30, letterSpacing: '-0.025em', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>
            Sign in
          </h1>
          <p style={{ fontSize: 14.5, color: 'var(--text3)', marginTop: 7 }}>
            Select your portal and enter your credentials.
          </p>

          {location.state?.plan && (
            <div className="alert alert-info" style={{ marginTop: 18 }}>
              Sign in to purchase: <strong>{location.state.plan.name}</strong>
            </div>
          )}

          {/* ── Role selector ─── */}
          <div style={{ display: 'flex', gap: 8, marginTop: 26 }}>
            {Object.entries(ROLES).map(([k, m]) => {
              const sel = role === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRole(k)}
                  style={{
                    flex: 1, padding: '14px 6px', borderRadius: 14,
                    textAlign: 'center', cursor: 'pointer',
                    transition: 'all .15s',
                    border: sel ? `1.5px solid ${m.tint.fg}` : '1.5px solid var(--border)',
                    background: sel ? m.tint.bg : '#fff',
                    outline: 'none',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, margin: '0 auto 9px',
                    background: sel ? m.tint.fg : 'var(--bg2)',
                    color: sel ? '#fff' : 'var(--text3)',
                    display: 'grid', placeItems: 'center',
                    transition: 'all .15s',
                  }}>
                    <m.Icon size={18} strokeWidth={1.8} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: sel ? m.tint.fg : 'var(--text2)' }}>
                    {m.label}
                  </div>
                </button>
              )
            })}
          </div>

          {error && <div className="alert alert-error" style={{ marginTop: 18 }}>{error}</div>}

          {/* ── Form ─── */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
            <div className="field">
              <label>Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                autoComplete="email"
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              className="btn btn-primary btn-full btn-lg"
              type="submit"
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading
                ? <><span className="spinner" /> Signing in…</>
                : <>Continue as {meta.label} <ArrowRight size={18} /></>
              }
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13.5, color: 'var(--text3)', fontWeight: 500, textDecoration: 'none' }}>
              <ArrowLeft size={14} /> Back to site
            </Link>
            <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              Forgot password?
            </Link>
          </div>

          <div style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 14, color: 'var(--text2)' }}>
            No account yet?{' '}
            <Link to="/register" state={location.state} style={{ fontWeight: 700, color: 'var(--accent)' }}>
              Create one
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
