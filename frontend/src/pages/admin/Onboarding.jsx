import { useState, useEffect } from 'react'
import api from '../../services/api'
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Admin Tutor Calendar ──────────────────────────────────────
function AdminTutorCalendar({ tutorId, tutorName }) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [calData, setCal] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const m = `${year}-${String(month+1).padStart(2,'0')}`
    api.get(`/admin/tutors/${tutorId}/calendar?month=${m}`)
      .then(r => setCal(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [tutorId, year, month])

  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDay    = new Date(year, month, 1).getDay()
  const blanks      = firstDay === 0 ? 6 : firstDay - 1

  const getStatus = (day) => {
    const date    = new Date(year, month, day)
    const dateKey = date.toISOString().split('T')[0]
    const dayName = date.toLocaleDateString('en-US', { weekday:'long' })
    const hasAvail = calData?.availability?.some(a => a.day_of_week === dayName)
    if (!hasAvail) return 'unavailable'
    const busy   = calData?.busy_slots?.some(b => new Date(b.date).toISOString().split('T')[0] === dateKey)
    const booked = calData?.sessions?.some(s => new Date(s.scheduled_date).toISOString().split('T')[0] === dateKey)
    if (busy || booked) return 'taken'
    return 'available'
  }

  const C = {
    available:   { bg:'#f0fdf4', border:'#86efac', color:'#15803d' },
    taken:       { bg:'#fef2f2', border:'#fca5a5', color:'#b91c1c' },
    unavailable: { bg:'var(--bg3)', border:'var(--border)', color:'var(--text3)' },
  }

  const prev = () => { if (month===0) { setMonth(11); setYear(y=>y-1) } else setMonth(m=>m-1) }
  const next = () => { if (month===11) { setMonth(0); setYear(y=>y+1) } else setMonth(m=>m+1) }

  return (
    <div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text)', marginBottom:10, fontWeight:500 }}>
        {tutorName}'s Calendar
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <button className="btn btn-outline btn-sm" onClick={prev} style={{ padding:'4px 8px' }}><ChevronLeft size={14} /></button>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{MONTHS[month]} {year}</span>
        <button className="btn btn-outline btn-sm" onClick={next} style={{ padding:'4px 8px' }}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display:'flex', gap:10, marginBottom:8, fontSize:10 }}>
        <span style={{ color:'#15803d' }}>■</span><span style={{ color:'var(--text3)' }}>Available</span>&nbsp;
        <span style={{ color:'#b91c1c' }}>■</span><span style={{ color:'var(--text3)' }}>Busy/Booked</span>&nbsp;
        <span style={{ color:'var(--text3)' }}>■</span><span style={{ color:'var(--text3)' }}>Unavailable</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:2 }}>
        {['M','T','W','T','F','S','S'].map((d,i) => (
          <div key={i} style={{ textAlign:'center', fontSize:8, color:'var(--text3)', fontFamily:'var(--font-mono)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {Array(blanks).fill(null).map((_,i) => <div key={`b${i}`} />)}
        {loading
          ? <div style={{ gridColumn:'1/-1', textAlign:'center', padding:8 }}><span className="spinner" role="status" aria-label="Loading" /></div>
          : Array.from({ length:daysInMonth }, (_,i) => i+1).map(day => {
              const status = getStatus(day)
              const c      = C[status]
              return (
                <div key={day} style={{ aspectRatio:'1', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:3, fontSize:10, fontFamily:'var(--font-mono)', background:c.bg, border:`1px solid ${c.border}`, color:c.color }}>
                  {day}
                </div>
              )
            })
        }
      </div>
      {/* Session list */}
      {calData?.sessions?.length > 0 && (
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', textTransform:'uppercase', marginBottom:6 }}>Booked this month</div>
          {calData.sessions.map(s => (
            <div key={s.id} style={{ fontSize:11, color:'var(--text2)', padding:'3px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontFamily:'var(--font-mono)', color:'var(--danger)' }}>{s.scheduled_date}</span> — {s.subject} ({s.student?.first_name})
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminOnboarding() {
  const [requests, setRequests]   = useState([])
  const [tutors, setTutors]       = useState([])
  const [courses, setCourses]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('pending')
  const [selected, setSelected]   = useState(null) // request being actioned
  const [showCalendar, setShowCalendar] = useState(null) // tutorId to show calendar for
  const [msgModal, setMsgModal]   = useState(null) // studentId to send message to
  const [assignForm, setAssignForm] = useState({ tutor_id:'', course_id:'', admin_message:'' })
  const [msgForm, setMsgForm]     = useState({ title:'', message:'' })
  const [assigning, setAssigning] = useState(false)
  const [sending, setSending]     = useState(false)
  const [assignErr, setAssignErr] = useState('')
  const [assignMsg, setAssignMsg] = useState('')
  const [msgErr, setMsgErr]       = useState('')
  const [msgSuccess, setMsgSuccess] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get(`/onboarding/admin/requests${filter !== 'all' ? `?status=${filter}` : ''}`),
      api.get('/admin/users?role=tutor'),
      api.get('/courses'),
    ]).then(([req, tut, cou]) => {
      setRequests(req.data.data?.requests||[])
      setTutors(tut.data.data?.users||[])
      setCourses(cou.data.data?.courses||[])
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  const handleAssign = async (e) => {
    e.preventDefault(); setAssignErr(''); setAssignMsg(''); setAssigning(true)
    try {
      await api.post('/onboarding/admin/assign', {
        request_id:    selected.id,
        tutor_id:      assignForm.tutor_id,
        course_id:     assignForm.course_id||undefined,
        admin_message: assignForm.admin_message||undefined,
      })
      setAssignMsg('Tutor assigned! Student and tutor have been notified.')
      setSelected(null)
      setAssignForm({ tutor_id:'', course_id:'', admin_message:'' })
      load()
    } catch (e) { setAssignErr(e.response?.data?.error||'Failed') }
    finally { setAssigning(false) }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault(); setMsgErr(''); setMsgSuccess(''); setSending(true)
    try {
      await api.post('/onboarding/admin/message', { student_id: msgModal, ...msgForm })
      setMsgSuccess('Message sent!')
      setMsgForm({ title:'', message:'' })
    } catch (e) { setMsgErr(e.response?.data?.error||'Failed') }
    finally { setSending(false) }
  }

  const pendingCount = requests.filter(r => r.status==='pending').length

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="dash-title">Onboarding Requests</div>
          <div className="dash-subtitle">Review student requests, assign tutors, send welcome messages.</div>
        </div>
        {pendingCount > 0 && <span className="badge badge-yellow" style={{ fontSize:13, padding:'4px 12px' }}>{pendingCount} pending</span>}
      </div>

      {assignMsg && <div className="alert alert-success">{assignMsg}</div>}

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['pending','assigned','all'].map(f => (
          <button key={f} className={`btn btn-sm ${filter===f?'btn-primary':'btn-outline'}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>

      {/* Assign modal */}
      {selected && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setSelected(null)}>
          <div className="modal" style={{ maxWidth:620, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="modal-header">
              <span className="modal-title">Assign Tutor — {selected.student?.first_name} {selected.student?.last_name}</span>
              <button className="modal-close" onClick={() => setSelected(null)}><X size={14} /></button>
            </div>

            {/* Student request summary */}
            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'12px 16px', marginBottom:20 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div>
                  <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4 }}>GOALS</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>{(selected.goals||[]).map(g => <span key={g} className="tag">{g}</span>)}</div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4 }}>SCHEDULE PREFERENCE</div>
                  <div style={{ fontSize:13, color:'var(--text2)' }}>
                    {selected.schedule_preference?.type} sessions · {(selected.schedule_preference?.days||[]).join(', ')} · {selected.schedule_preference?.time_preference}
                  </div>
                </div>
                {selected.preferred_tutor && (
                  <div>
                    <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4 }}>PREFERRED TUTOR</div>
                    <div style={{ fontSize:13, color:'var(--accent)' }}>{selected.preferred_tutor.first_name} {selected.preferred_tutor.last_name}</div>
                  </div>
                )}
                {selected.message && (
                  <div>
                    <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4 }}>STUDENT MESSAGE</div>
                    <div style={{ fontSize:13, color:'var(--text2)', fontStyle:'italic' }}>"{selected.message}"</div>
                  </div>
                )}
              </div>
            </div>

            {assignErr && <div className="alert alert-error">{assignErr}</div>}

            <form onSubmit={handleAssign}>
              <div className="form-group">
                <label className="form-label">Assign Tutor *</label>
                <select className="form-select" value={assignForm.tutor_id} onChange={e => setAssignForm(p => ({ ...p, tutor_id:e.target.value }))} required>
                  <option value="">Select tutor…</option>
                  {tutors.map(t => (
                    <option key={t.id} value={t.id}>{t.first_name} {t.last_name} ({t.email})</option>
                  ))}
                </select>
              </div>

              {/* Show calendar for selected tutor */}
              {assignForm.tutor_id && (
                <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16, marginBottom:16 }}>
                  <AdminTutorCalendar
                    tutorId={assignForm.tutor_id}
                    tutorName={tutors.find(t=>t.id===assignForm.tutor_id)?.first_name+' '+tutors.find(t=>t.id===assignForm.tutor_id)?.last_name}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Enroll in course (optional)</label>
                <select className="form-select" value={assignForm.course_id} onChange={e => setAssignForm(p => ({ ...p, course_id:e.target.value }))}>
                  <option value="">No course enrollment</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Onboarding message to student</label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="e.g. Welcome to CareerLaunch! We've matched you with Sarah who specialises in technical interviews. She'll reach out shortly to schedule your first session."
                  value={assignForm.admin_message}
                  onChange={e => setAssignForm(p => ({ ...p, admin_message:e.target.value }))}
                  style={{ resize:'vertical' }}
                />
              </div>

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setSelected(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={assigning||!assignForm.tutor_id}>
                  {assigning ? <><span className="spinner" /> Assigning…</> : 'Assign Tutor & Onboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send message modal */}
      {msgModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setMsgModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Send Onboarding Message</span>
              <button className="modal-close" onClick={() => setMsgModal(null)}><X size={14} /></button>
            </div>
            {msgErr && <div className="alert alert-error">{msgErr}</div>}
            {msgSuccess && <div className="alert alert-success">{msgSuccess}</div>}
            <form onSubmit={handleSendMessage}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input className="form-input" placeholder="Message subject" value={msgForm.title} onChange={e => setMsgForm(p => ({ ...p, title:e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea className="form-input" rows={5} placeholder="Write your onboarding message…" value={msgForm.message} onChange={e => setMsgForm(p => ({ ...p, message:e.target.value }))} required style={{ resize:'vertical' }} />
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setMsgModal(null)}>Close</button>
                <button type="submit" className="btn btn-primary" disabled={sending}>{sending?<><span className="spinner"/> Sending…</>:'Send Message'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:48 }}><span className="spinner" role="status" aria-label="Loading" /></div>
      ) : requests.length===0 ? (
        <div className="empty-state">No {filter} onboarding requests.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {requests.map(req => (
            <div key={req.id} className="card">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  {/* Student info */}
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--bg3)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', color:'var(--accent)', flexShrink:0 }}>
                      {req.student?.first_name?.[0]}{req.student?.last_name?.[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight:500, fontSize:14, color:'var(--text)' }}>{req.student?.first_name} {req.student?.last_name}</div>
                      <div style={{ fontSize:12, color:'var(--text2)' }}>{req.student?.email}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--font-mono)' }}>{new Date(req.created_at).toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Goals */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                    {(req.goals||[]).map(g => <span key={g} className="tag">{g}</span>)}
                  </div>

                  {/* Schedule */}
                  <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>
                    <span style={{ color:'var(--text3)', fontFamily:'var(--font-mono)', marginRight:6 }}>Schedule:</span>
                    {req.schedule_preference?.type} · {(req.schedule_preference?.days||[]).join(', ')} · {req.schedule_preference?.time_preference}
                  </div>

                  {/* Preferred tutor */}
                  {req.preferred_tutor && (
                    <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>
                      <span style={{ color:'var(--text3)', fontFamily:'var(--font-mono)', marginRight:6 }}>Preferred tutor:</span>
                      <span style={{ color:'var(--accent)' }}>{req.preferred_tutor.first_name} {req.preferred_tutor.last_name}</span>
                    </div>
                  )}

                  {/* Student message */}
                  {req.message && (
                    <div style={{ fontSize:12, color:'var(--text2)', fontStyle:'italic', marginBottom:6 }}>"{req.message}"</div>
                  )}

                  {/* Assigned info */}
                  {req.status==='assigned' && req.assigned_tutor && (
                    <div style={{ fontSize:12, color:'var(--success)', marginTop:6, display:'flex', alignItems:'center', gap:4 }}>
                      <Check size={12}/> Assigned to {req.assigned_tutor.first_name} {req.assigned_tutor.last_name}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginLeft:20, flexShrink:0 }}>
                  <span className={`badge badge-${req.status==='pending'?'yellow':req.status==='assigned'?'green':'red'}`}>{req.status}</span>
                  {req.status==='pending' && (
                    <button className="btn btn-primary btn-sm" onClick={() => { setSelected(req); setAssignForm({ tutor_id: req.preferred_tutor_id||'', course_id:'', admin_message:'' }) }}>
                      Assign Tutor
                    </button>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={() => setMsgModal(req.student_id)}>
                    Send Message
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}