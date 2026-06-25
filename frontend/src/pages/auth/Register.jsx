import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import usePageTitle from '../../utils/usePageTitle'
import { ArrowRight, ArrowLeft, User, BookOpen, Clock } from 'lucide-react'

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

// ── Role options ────────────────────────────────────────────────
// Single accent tint keeps the page on the design system's one-accent palette.
const TINT = { bg: 'var(--accent-light)', fg: 'var(--accent)' }
const ROLES = {
  student: {
    label: 'Student',
    Icon:  User,
    tint:  TINT,
    desc:  'I want to book sessions & land my next role',
  },
  tutor: {
    label: 'Tutor',
    Icon:  BookOpen,
    tint:  TINT,
    desc:  'I want to mentor students & earn',
  },
}

const BENEFITS = [
  { title: '1-on-1, never 1-to-many',  body: 'Your mentor prepares for you, not a cohort of 200.' },
  { title: 'Credits never expire',      body: "Book when you're genuinely ready — no deadline pressure." },
  { title: 'Mentors from the inside',   body: "Coaches who've hired at the companies you're targeting." },
]

export default function Register() {
  usePageTitle('Create account')
  const { register, getRedirect } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [form, setForm]       = useState({ first_name: '', last_name: '', email: '', password: '', role: 'student' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)

  const redirect = location.state?.redirect || null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await register(form)
      if (user.pendingApproval) { setPending(true); return }
      if (redirect) { navigate(redirect, { state: location.state }); return }
      navigate(getRedirect(user))
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (pending) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ maxWidth: 460, width: '100%', padding: 40, textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--warning-bg)', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
          <Clock size={28} strokeWidth={2.2} style={{ color: 'var(--warning)' }} />
        </div>
        <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.025em' }}>Application received</h1>
        <p style={{ color: 'var(--text2)', fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
          Your tutor account is <strong>pending admin approval</strong>. We'll notify you at <strong>{form.email}</strong> once it's approved — usually within 24 hours.
        </p>
        <button className="btn btn-outline btn-full" style={{ marginTop: 28 }} onClick={() => navigate('/')}>Back to home</button>
      </div>
    </div>
  )

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
            Your career,<br />your terms.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,.78)', marginTop: 16, maxWidth: 360, lineHeight: 1.6 }}>
            Create an account in seconds. Credits arrive the moment your plan is active — book your first session the same day.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 32 }}>
            {BENEFITS.map(({ title, body }) => (
              <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                {/* check circle */}
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(79,70,229,.35)', border: '1px solid rgba(79,70,229,.5)', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{body}</div>
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
            Create account
          </h1>
          <p style={{ fontSize: 14.5, color: 'var(--text3)', marginTop: 7 }}>
            One step before your first session.
          </p>

          {location.state?.plan && (
            <div className="alert alert-info" style={{ marginTop: 18 }}>
              Creating account to purchase: <strong>{location.state.plan.name}</strong>
            </div>
          )}

          {/* ── Role selector ─── */}
          <div style={{ display: 'flex', gap: 8, marginTop: 26 }}>
            {Object.entries(ROLES).map(([k, m]) => {
              const sel = form.role === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, role: k }))}
                  style={{
                    flex: 1, padding: '16px 8px', borderRadius: 14,
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: sel ? m.tint.fg : 'var(--text2)', marginBottom: 3 }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 11.5, color: sel ? m.tint.fg : 'var(--text3)', lineHeight: 1.4, opacity: 0.85 }}>
                    {m.desc}
                  </div>
                </button>
              )
            })}
          </div>

          {error && <div className="alert alert-error" style={{ marginTop: 18 }}>{error}</div>}

          {/* ── Form ─── */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
            <div className="form-grid-2">
              <div className="field">
                <label>First name</label>
                <input
                  className="input"
                  placeholder="Jane"
                  value={form.first_name}
                  onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="field">
                <label>Last name</label>
                <input
                  className="input"
                  placeholder="Doe"
                  value={form.last_name}
                  onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}
                  autoComplete="family-name"
                  required
                />
              </div>
            </div>

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
                placeholder="At least 8 characters"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            <button
              className="btn btn-primary btn-full btn-lg"
              type="submit"
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading
                ? <><span className="spinner" /> Creating account…</>
                : <>Create account & continue <ArrowRight size={18} /></>
              }
            </button>

            <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
              By creating an account you agree to our{' '}
              <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Terms</span>{' '}and{' '}
              <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span>.
            </p>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13.5, color: 'var(--text3)', fontWeight: 500, textDecoration: 'none' }}>
              <ArrowLeft size={14} /> Back to site
            </Link>
            <div style={{ fontSize: 14, color: 'var(--text2)' }}>
              Have an account?{' '}
              <Link to="/login" state={location.state} style={{ fontWeight: 700, color: 'var(--accent)' }}>
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
