import { confirmDialog } from '../../components/ConfirmDialog'
import { toast } from '../../services/toast'
// src/pages/admin/TutorFees.jsx
import { useState, useEffect } from 'react'
import api from '../../services/api'
import { X, Check } from 'lucide-react'

export default function TutorFees() {
  const [assignments, setAssignments] = useState([])
  const [fees, setFees]               = useState([])
  const [tutors, setTutors]           = useState([])
  const [courses, setCourses]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState('all') // all | unpaid | paid
  const [tutorFilter, setTutorFilter] = useState('')
  const [showAdd, setShowAdd]         = useState(false)
  const [addForm, setAddForm] = useState({ tutor_id:'', student_id:'', course_id:'', amount_cents:0, start_date:'', notes:'' })
  const [adding, setAdding]   = useState(false)
  const [addErr, setAddErr]   = useState('')
  const [paying, setPaying]   = useState(null)
  const [stats, setStats]     = useState({ total_owed:0, total_paid:0 })

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/admin/tutor-fees'),
      api.get('/admin/assignments-with-fees'),
      api.get('/admin/users?role=tutor'),
      api.get('/courses'),
    ]).then(([f, a, t, c]) => {
      setFees(f.data.data?.fees||[])
      setStats({ total_owed: f.data.data?.total_owed||0, total_paid: f.data.data?.total_paid||0 })
      setAssignments(a.data.data?.assignments||[])
      setTutors(t.data.data?.users||[])
      setCourses(c.data.data?.courses||[])
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleMarkPaid = async (id) => {
    if (!(await confirmDialog('Mark this fee as paid? A notification will be sent to the tutor.'))) return
    setPaying(id)
    try { await api.patch(`/admin/tutor-fees/${id}/pay`); load() }
    catch (e) { toast.error(e.response?.data?.error||'Failed') }
    finally { setPaying(null) }
  }

  const handleAddFee = async (e) => {
    e.preventDefault(); setAddErr(''); setAdding(true)
    try {
      await api.post('/admin/tutor-fees', { ...addForm, amount_cents: parseInt(addForm.amount_cents)||0 })
      setShowAdd(false)
      setAddForm({ tutor_id:'', student_id:'', course_id:'', amount_cents:0, start_date:'', notes:'' })
      load()
    } catch (err) { setAddErr(err.response?.data?.error||'Failed') }
    finally { setAdding(false) }
  }

  // Get all students from assignments for the add form
  const allStudents = [...new Set(assignments.map(a => JSON.stringify({ id:a.student.id, name:`${a.student.first_name} ${a.student.last_name}`, email:a.student.email })))].map(s => JSON.parse(s))

  const filtered = fees.filter(f => {
    if (filter==='paid'   && !f.paid)  return false
    if (filter==='unpaid' && f.paid)   return false
    if (tutorFilter && f.tutor_id !== tutorFilter) return false
    return true
  })

  const unpaidCount = fees.filter(f => !f.paid).length

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:48 }}><span className="spinner" role="status" aria-label="Loading" /></div>

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="dash-title">Tutor Fee Tracking</div>
          <div className="dash-subtitle">Track which tutors have been paid for each student and course.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Fee Record</button>
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom:20 }}>
        <div className="stat-card"><div className="stat-val">{fees.length}</div><div className="stat-label">Total records</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color:'var(--danger)' }}>{unpaidCount}</div><div className="stat-label">Unpaid</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color:'var(--success)' }}>${(stats.total_paid/100).toFixed(0)}</div><div className="stat-label">Total paid</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color:'var(--accent)' }}>${(stats.total_owed/100).toFixed(0)}</div><div className="stat-label">Outstanding</div></div>
      </div>

      {/* Add fee modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Fee Record</span>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={14} /></button>
            </div>
            {addErr && <div className="alert alert-error">{addErr}</div>}
            <form onSubmit={handleAddFee}>
              <div className="form-group">
                <label className="form-label">Tutor</label>
                <select className="form-select" value={addForm.tutor_id} onChange={e => setAddForm(p=>({...p,tutor_id:e.target.value}))} required>
                  <option value="">Select tutor…</option>
                  {tutors.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Student</label>
                <select className="form-select" value={addForm.student_id} onChange={e => setAddForm(p=>({...p,student_id:e.target.value}))} required>
                  <option value="">Select student…</option>
                  {allStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Course</label>
                <select className="form-select" value={addForm.course_id} onChange={e => setAddForm(p=>({...p,course_id:e.target.value}))} required>
                  <option value="">Select course…</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Fee amount (cents)</label>
                  <input className="form-input" type="number" min={0} placeholder="e.g. 5000 = $50" value={addForm.amount_cents} onChange={e => setAddForm(p=>({...p,amount_cents:e.target.value}))} />
                  {addForm.amount_cents > 0 && <div style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>${(addForm.amount_cents/100).toFixed(2)}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Course start date</label>
                  <input className="form-input" type="date" value={addForm.start_date} onChange={e => setAddForm(p=>({...p,start_date:e.target.value}))} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input className="form-input" placeholder="Any notes about this fee" value={addForm.notes} onChange={e => setAddForm(p=>({...p,notes:e.target.value}))} />
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={adding}>{adding?<><span className="spinner"/> Adding…</>:'Add Record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        {['all','unpaid','paid'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:'6px 14px', borderRadius:4, border:`1px solid ${filter===f?'var(--accent)':'var(--border2)'}`, background:filter===f?'var(--accent-dim)':'var(--bg3)', color:filter===f?'var(--accent)':'var(--text2)', cursor:'pointer', fontSize:12, fontFamily:'var(--font-mono)' }}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
        <select value={tutorFilter} onChange={e => setTutorFilter(e.target.value)} style={{ padding:'6px 12px', borderRadius:4, border:'1px solid var(--border2)', background:'var(--bg3)', color:'var(--text2)', fontSize:12, marginLeft:'auto' }}>
          <option value="">All tutors</option>
          {tutors.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
        </select>
      </div>

      {/* Fee records */}
      <div className="card">
        <div className="card-header"><span className="card-title">Fee Records ({filtered.length})</span></div>
        {filtered.length === 0 ? (
          <div className="empty-state">No fee records found.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {filtered.map(fee => (
              <div key={fee.id} style={{ padding:'14px 0', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                    <span className={`badge badge-${fee.paid?'green':'red'}`}>{fee.paid?'Paid':'Unpaid'}</span>
                    <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{fee.course?.title}</span>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:13, color: fee.paid?'var(--success)':'var(--accent)' }}>
                      ${(fee.amount_cents/100).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--text2)', flexWrap:'wrap' }}>
                    <span>
                      <span style={{ color:'var(--text3)' }}>Tutor: </span>
                      {fee.tutor?.first_name} {fee.tutor?.last_name}
                    </span>
                    <span>
                      <span style={{ color:'var(--text3)' }}>Student: </span>
                      {fee.student?.first_name} {fee.student?.last_name}
                    </span>
                    <span>
                      <span style={{ color:'var(--text3)' }}>Start: </span>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(fee.start_date).toLocaleDateString()}</span>
                    </span>
                    {fee.paid_at && (
                      <span>
                        <span style={{ color:'var(--text3)' }}>Paid on: </span>
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(fee.paid_at).toLocaleDateString()}</span>
                      </span>
                    )}
                  </div>
                  {fee.notes && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{fee.notes}</div>}
                </div>
                <div style={{ flexShrink:0 }}>
                  {!fee.paid && (
                    <button
                      className="btn btn-sm"
                      style={{ background:'var(--success-bg)', color:'var(--success)', border:'1px solid #86efac' }}
                      onClick={() => handleMarkPaid(fee.id)}
                      disabled={paying === fee.id}
                    >
                      {paying===fee.id ? <><span className="spinner" /> Marking…</> : <><Check size={13}/> Mark Paid</>}
                    </button>
                  )}
                  {fee.paid && (
                    <span style={{ fontSize:11, color:'var(--success)', fontFamily:'var(--font-mono)', display:'inline-flex', alignItems:'center', gap:4 }}><Check size={11}/> Paid</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignments overview — who has no fee record */}
      <div style={{ marginTop:24 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Assignments Overview</span>
            <span style={{ fontSize:11, color:'var(--text3)' }}>Assignments without fee records shown in red</span>
          </div>
          {assignments.length === 0 ? (
            <div className="empty-state">No active assignments.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Tutor</th>
                    <th>Since</th>
                    <th>Fee records</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => {
                    const hasFees = a.tutor_fees?.length > 0
                    const allPaid = hasFees && a.tutor_fees.every(f => f.paid)
                    const somePaid = hasFees && a.tutor_fees.some(f => f.paid)
                    return (
                      <tr key={a.id}>
                        <td style={{ color:'var(--text)' }}>{a.student.first_name} {a.student.last_name}</td>
                        <td>{a.tutor.first_name} {a.tutor.last_name}</td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(a.start_date).toLocaleDateString()}</td>
                        <td>
                          {!hasFees ? (
                            <span style={{ fontSize:11, color:'var(--danger)' }}>No fee record</span>
                          ) : (
                            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                              {a.tutor_fees.map(f => (
                                <div key={f.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                                  <span className={`badge badge-${f.paid?'green':'yellow'}`} style={{ fontSize:10 }}>{f.paid?'Paid':'Unpaid'}</span>
                                  <span style={{ fontSize:11, color:'var(--text2)' }}>{f.course?.title}</span>
                                  <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color: f.paid?'var(--success)':'var(--accent)' }}>${(f.amount_cents/100).toFixed(0)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          {!hasFees && <span className="badge badge-red">No record</span>}
                          {hasFees && allPaid && <span className="badge badge-green">All paid</span>}
                          {hasFees && !allPaid && somePaid && <span className="badge badge-yellow">Partial</span>}
                          {hasFees && !allPaid && !somePaid && <span className="badge badge-red">Unpaid</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
