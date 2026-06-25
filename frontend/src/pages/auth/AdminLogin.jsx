import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import usePageTitle from '../../utils/usePageTitle'

export default function AdminLogin() {
  usePageTitle('Admin sign in')
  const { login, logout } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm]     = useState({ email:'', password:'' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const user = await login(form.email, form.password)
      if (user.role !== 'admin') {
        await logout()
        setError('This login is for admins only.')
        return
      }
      navigate('/admin')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="page" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:360 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:24 }}>▸ Admin Portal</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:20, color:'var(--accent)', marginBottom:6 }}>Admin sign in</div>
        <div style={{ fontSize:13, color:'var(--text2)', marginBottom:28 }}>Restricted access. Admins only.</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" /> Signing in…</> : 'Sign in as Admin'}
          </button>
        </form>
      </div>
    </div>
  )
}
