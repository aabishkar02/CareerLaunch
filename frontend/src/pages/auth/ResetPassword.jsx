import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import { toast } from '../../services/toast'
import usePageTitle from '../../utils/usePageTitle'
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react'

export default function ResetPassword() {
  usePageTitle('Reset password')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [form, setForm]       = useState({ password: '', confirmPassword: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, ...form })
      toast.success('Password reset successful. Please log in with your new password.')
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  // Arrived without a token — the link is broken or was typed manually.
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: '40px 24px' }}>
        <div className="card" style={{ width: '100%', maxWidth: 440, padding: '36px 32px' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--danger-bg)', color: 'var(--danger)', display: 'grid', placeItems: 'center', marginBottom: 18 }}>
            <ShieldAlert size={22} strokeWidth={1.8} />
          </div>
          <h1 style={{ fontSize: 26, letterSpacing: '-0.025em', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>
            Invalid reset link
          </h1>
          <p style={{ fontSize: 14.5, color: 'var(--text2)', marginTop: 10, lineHeight: 1.6 }}>
            This password reset link is missing or malformed. Request a new one and use the link from the email.
          </p>
          <Link to="/forgot-password" className="btn btn-primary btn-full btn-lg" style={{ marginTop: 22 }}>
            Request a new link
          </Link>
          <div style={{ marginTop: 18 }}>
            <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13.5, color: 'var(--text3)', fontWeight: 500, textDecoration: 'none' }}>
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: '40px 24px' }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: '36px 32px' }}>

        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', marginBottom: 18 }}>
          <KeyRound size={22} strokeWidth={1.8} />
        </div>

        <h1 style={{ fontSize: 26, letterSpacing: '-0.025em', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>
          Choose a new password
        </h1>
        <p style={{ fontSize: 14.5, color: 'var(--text3)', marginTop: 8 }}>
          Your new password must be at least 8 characters.
        </p>

        {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
          <div className="field">
            <label>New password</label>
            <input
              className="input"
              type="password"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              autoComplete="new-password"
              minLength={8}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input
              className="input"
              type="password"
              placeholder="Repeat new password"
              value={form.confirmPassword}
              onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" /> Resetting…</> : 'Reset password'}
          </button>
        </form>

        <div style={{ marginTop: 22 }}>
          <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13.5, color: 'var(--text3)', fontWeight: 500, textDecoration: 'none' }}>
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
