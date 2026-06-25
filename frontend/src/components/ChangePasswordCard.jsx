// Change-password card shared by the student and tutor dashboards.
// On success the backend revokes every session, so we clear local auth
// state and send the user back to the login page.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { toast } from '../services/toast'
import { Lock } from 'lucide-react'

export default function ChangePasswordCard() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    setSaving(true)
    try {
      await api.patch('/auth/change-password', form)
      // All sessions are revoked server-side — log out locally and re-authenticate.
      toast.success('Password changed. Please log in with your new password.')
      setUser?.(null)
      localStorage.removeItem('hasSession')
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Lock size={18} style={{ color: 'var(--accent)' }} /> Change password
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        After changing your password you'll be signed out everywhere and asked to log in again.
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label>Current password</label>
          <input className="input" type="password" placeholder="••••••••" value={form.currentPassword}
            onChange={set('currentPassword')} autoComplete="current-password" required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="field">
            <label>New password</label>
            <input className="input" type="password" placeholder="Min. 8 characters" value={form.newPassword}
              onChange={set('newPassword')} autoComplete="new-password" minLength={8} required />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input className="input" type="password" placeholder="Repeat new password" value={form.confirmPassword}
              onChange={set('confirmPassword')} autoComplete="new-password" minLength={8} required />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? <><span className="spinner" /> Updating…</> : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  )
}
