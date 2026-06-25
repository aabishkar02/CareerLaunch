import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import usePageTitle from '../../utils/usePageTitle'
import { ArrowLeft, Mail, MailCheck } from 'lucide-react'

export default function ForgotPassword() {
  usePageTitle('Forgot password')
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: '40px 24px' }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: '36px 32px' }}>

        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', marginBottom: 18 }}>
          {sent ? <MailCheck size={22} strokeWidth={1.8} /> : <Mail size={22} strokeWidth={1.8} />}
        </div>

        {sent ? (
          <>
            <h1 style={{ fontSize: 26, letterSpacing: '-0.025em', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>
              Check your email
            </h1>
            <p style={{ fontSize: 14.5, color: 'var(--text2)', marginTop: 10, lineHeight: 1.6 }}>
              If an account exists for <strong>{email}</strong>, we've sent a password reset link.
              The link expires in <strong>15 minutes</strong>.
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--text3)', marginTop: 12 }}>
              Didn't get it? Check your spam folder, or{' '}
              <button onClick={() => setSent(false)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit' }}>
                try again
              </button>.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 26, letterSpacing: '-0.025em', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>
              Forgot your password?
            </h1>
            <p style={{ fontSize: 14.5, color: 'var(--text3)', marginTop: 8 }}>
              Enter your account email and we'll send you a link to reset it.
            </p>

            {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
              <div className="field">
                <label>Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>
              <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
                {loading ? <><span className="spinner" /> Sending…</> : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <div style={{ marginTop: 22 }}>
          <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13.5, color: 'var(--text3)', fontWeight: 500, textDecoration: 'none' }}>
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
