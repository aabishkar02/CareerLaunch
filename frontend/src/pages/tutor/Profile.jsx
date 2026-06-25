// src/pages/tutor/Profile.jsx
import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Check } from 'lucide-react'
import TimezoneSelector from '../../components/TimezoneSelector'

export default function TutorProfile() {
  const { user, updateTimezone } = useAuth()
  const [profile, setProfile]    = useState(null)
  const [loading, setLoading]    = useState(true)
  const [saving, setSaving]      = useState(false)
  const [tzSaving, setTzSaving]  = useState(false)
  const [msg, setMsg]            = useState('')
  const [err, setErr]            = useState('')

  const [form, setForm] = useState({
    bio:              '',
    experience_years: 0,
    linkedin_url:     '',
    github_url:       '',
    specialisations:  [],
    qualifications:   [],
  })

  const SPEC_OPTIONS = ['Resume','LinkedIn','GitHub Portfolio','Personal Brand','Job Search','Technical Interview','Behavioural Interview','Offer Negotiation','System Design','DSA']

  const [newQual, setNewQual] = useState({ degree:'', institution:'', year:'' })

  useEffect(() => {
    api.get('/onboarding/tutors/me/profile')
      .then(r => {
        const p = r.data.data?.profile
        if (p) {
          setProfile(p)
          setForm({
            bio:              p.bio||'',
            experience_years: p.experience_years||0,
            linkedin_url:     p.linkedin_url||'',
            github_url:       p.github_url||'',
            specialisations:  p.specialisations||[],
            qualifications:   p.qualifications||[],
          })
        }
      })
      .catch(() => {}) // no profile yet is fine
      .finally(() => setLoading(false))
  }, [])

  const toggleSpec = (s) => setForm(p => ({
    ...p,
    specialisations: p.specialisations.includes(s)
      ? p.specialisations.filter(x=>x!==s)
      : [...p.specialisations, s],
  }))

  const addQual = () => {
    if (!newQual.degree || !newQual.institution) return
    setForm(p => ({ ...p, qualifications: [...p.qualifications, { ...newQual }] }))
    setNewQual({ degree:'', institution:'', year:'' })
  }

  const removeQual = (i) => setForm(p => ({ ...p, qualifications: p.qualifications.filter((_,idx) => idx!==i) }))

  const handleSave = async (e) => {
    e.preventDefault(); setMsg(''); setErr(''); setSaving(true)
    try {
      await api.put('/onboarding/tutors/me/profile', form)
      setMsg('Profile updated successfully!')
    } catch (error) { setErr(error.response?.data?.error||'Failed') }
    finally { setSaving(false) }
  }

  const handleTimezoneChange = async (tz) => {
    setTzSaving(true)
    try {
      await updateTimezone(tz)
      setMsg('Timezone updated!')
    } catch { setErr('Failed to update timezone') }
    finally { setTzSaving(false) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:48 }}><span className="spinner" role="status" aria-label="Loading" /></div>

  return (
    <div>
      <div className="dash-header">
        <div className="dash-title">My Profile</div>
        <div className="dash-subtitle">Students see this when browsing tutors. Keep it accurate and compelling.</div>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      <form onSubmit={handleSave}>
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* Timezone */}
          <div className="card">
            <div className="card-header"><span className="card-title">Timezone</span></div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
              Students see your availability converted to their own timezone. Set yours so the calendar is accurate.
            </div>
            <TimezoneSelector
              value={user?.timezone || ''}
              onChange={handleTimezoneChange}
              label="Your timezone"
            />
            {tzSaving && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Saving…</div>}
          </div>

          {/* Bio */}
          <div className="card">
            <div className="card-header"><span className="card-title">About</span></div>
            <div className="form-group">
              <label className="form-label">Bio</label>
              <textarea className="form-input" rows={4} placeholder="Tell students about your background, teaching style, and what makes you a great tutor…" value={form.bio} onChange={e => setForm(p => ({ ...p, bio:e.target.value }))} style={{ resize:'vertical' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Years of experience</label>
              <input className="form-input" type="number" min={0} max={50} value={form.experience_years} onChange={e => setForm(p => ({ ...p, experience_years:parseInt(e.target.value)||0 }))} style={{ width:120 }} />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">LinkedIn URL</label>
                <input className="form-input" type="url" placeholder="https://linkedin.com/in/..." value={form.linkedin_url} onChange={e => setForm(p => ({ ...p, linkedin_url:e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">GitHub URL</label>
                <input className="form-input" type="url" placeholder="https://github.com/..." value={form.github_url} onChange={e => setForm(p => ({ ...p, github_url:e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Specialisations */}
          <div className="card">
            <div className="card-header"><span className="card-title">Specialisations</span></div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12 }}>Select the modules and areas you specialise in.</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {SPEC_OPTIONS.map(s => {
                const sel = form.specialisations.includes(s)
                return (
                  <button key={s} type="button" onClick={() => toggleSpec(s)}
                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:'var(--radius)', border:`1px solid ${sel?'var(--accent)':'var(--border2)'}`, background: sel?'var(--accent-dim)':'var(--bg3)', color: sel?'var(--accent)':'var(--text2)', fontFamily:'var(--font-mono)', fontSize:12, cursor:'pointer' }}>
                    {sel&&<Check size={11}/>}{s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Qualifications */}
          <div className="card">
            <div className="card-header"><span className="card-title">Qualifications</span></div>

            {form.qualifications.length > 0 && (
              <div style={{ marginBottom:16 }}>
                {form.qualifications.map((q,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{q.degree}</div>
                      <div style={{ fontSize:12, color:'var(--text2)' }}>{q.institution}{q.year?` · ${q.year}`:''}</div>
                    </div>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeQual(i)}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
              <div style={{ fontSize:12, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:10, textTransform:'uppercase' }}>Add qualification</div>
              <div className="grid-3" style={{ gap:10, marginBottom:10 }}>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Degree / Cert</label>
                  <input className="form-input" placeholder="BSc Computer Science" value={newQual.degree} onChange={e => setNewQual(p => ({ ...p, degree:e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Institution</label>
                  <input className="form-input" placeholder="MIT" value={newQual.institution} onChange={e => setNewQual(p => ({ ...p, institution:e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Year</label>
                  <input className="form-input" placeholder="2020" value={newQual.year} onChange={e => setNewQual(p => ({ ...p, year:e.target.value }))} />
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={addQual} disabled={!newQual.degree||!newQual.institution}>
                + Add Qualification
              </button>
            </div>
          </div>

          <div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" /> Saving…</> : 'Save Profile'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}