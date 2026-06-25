import { confirmDialog } from '../../components/ConfirmDialog'
import { toast } from '../../services/toast'
// DROP THIS into src/pages/tutor/Sessions.jsx
// Then import and add route in tutor/Dashboard.jsx

import { useState, useEffect } from 'react'
import api from '../../services/api'
import { X } from 'lucide-react'

export default function TutorSessions() {
  const [sessions,    setSessions]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [actionId,    setActionId]    = useState(null)
  const [showLink,    setShowLink]    = useState(null) // session id to add meeting link
  const [meetingLink, setMeetingLink] = useState('')
  const [err,  setErr]  = useState('')
  const [msg,  setMsg]  = useState('')

  const load = () => {
    setLoading(true)
    api.get('/sessions/my')
      .then(r => setSessions(r.data.data?.sessions || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleConfirm = async (id) => {
    setActionId(id); setErr(''); setMsg('')
    try {
      await api.patch(`/sessions/${id}/confirm`)
      setMsg('Session confirmed. Student has been notified.')
      load()
    } catch (e) { setErr(e.response?.data?.error || 'Failed') }
    finally { setActionId(null) }
  }

  const handleConfirmWithLink = async (id) => {
    setActionId(id); setErr(''); setMsg('')
    try {
      await api.patch(`/sessions/${id}/confirm`, { meeting_link: meetingLink })
      setMsg('Session confirmed with meeting link. Student has been notified.')
      setShowLink(null); setMeetingLink('')
      load()
    } catch (e) { setErr(e.response?.data?.error || 'Failed') }
    finally { setActionId(null) }
  }

  const handleComplete = async (id) => {
    if (!(await confirmDialog('Mark this session as completed?'))) return
    setActionId(id)
    try {
      await api.patch(`/sessions/${id}/complete`)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setActionId(null) }
  }

  const handleCancel = async (id) => {
    if (!(await confirmDialog('Cancel this session?'))) return
    setActionId(id)
    try {
      await api.patch(`/sessions/${id}/cancel`, { reason: 'Cancelled by tutor' })
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setActionId(null) }
  }

  const pending   = sessions.filter(s => s.status === 'pending')
  const confirmed = sessions.filter(s => s.status === 'confirmed')
  const past      = sessions.filter(s => ['completed','cancelled'].includes(s.status))

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:48 }}><span className="spinner" role="status" aria-label="Loading" /></div>

  return (
    <div>
      <div className="dash-header">
        <div className="dash-title">Sessions</div>
        <div className="dash-subtitle">
          {pending.length} pending approval · {confirmed.length} confirmed · {past.length} past
        </div>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {/* Meeting link modal */}
      {showLink && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowLink(null)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Confirm with Meeting Link</span>
              <button className="modal-close" onClick={() => setShowLink(null)}><X size={14} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Meeting Link (optional)</label>
              <input
                className="form-input"
                type="url"
                placeholder="https://teams.microsoft.com/..."
                value={meetingLink}
                onChange={e => setMeetingLink(e.target.value)}
              />
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>
                Leave blank to confirm without a link — you can add it later.
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowLink(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => handleConfirmWithLink(showLink)}
                disabled={actionId === showLink}
              >
                {actionId === showLink ? <><span className="spinner" /> Confirming…</> : 'Confirm Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending — needs action */}
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom:20 }}>
          <div className="card-header">
            <span className="card-title">Pending Approval ({pending.length})</span>
          </div>
          {pending.map(s => (
            <div key={s.id} style={{ padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', marginBottom:3 }}>{s.subject}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>
                    {new Date(s.scheduled_date).toLocaleDateString()} · {s.start_time} – {s.end_time}
                  </div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>
                    Student: {s.student?.first_name} {s.student?.last_name} ({s.student?.email})
                  </div>
                  {s.notes && <div style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>"{s.notes}"</div>}
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0, marginLeft:16 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowLink(s.id)}
                    disabled={actionId === s.id}
                  >
                    Confirm
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleCancel(s.id)}
                    disabled={actionId === s.id}
                  >
                    {actionId === s.id ? <span className="spinner" /> : 'Decline'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmed — upcoming */}
      {confirmed.length > 0 && (
        <div className="card" style={{ marginBottom:20 }}>
          <div className="card-header">
            <span className="card-title">Confirmed Sessions ({confirmed.length})</span>
          </div>
          {confirmed.map(s => (
            <div key={s.id} style={{ padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', marginBottom:3 }}>{s.subject}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>
                    {new Date(s.scheduled_date).toLocaleDateString()} · {s.start_time} – {s.end_time}
                  </div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>
                    {s.student?.first_name} {s.student?.last_name}
                  </div>
                  {s.meeting_link && (
                    <a href={s.meeting_link} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:'var(--accent)' }}>
                      Meeting link ↗
                    </a>
                  )}
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0, marginLeft:16 }}>
                  {s.meeting_link ? (
                    <a href={s.meeting_link} target="_blank" rel="noopener noreferrer">
                      <button className="btn btn-primary btn-sm">Join</button>
                    </a>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => { setShowLink(s.id); setMeetingLink('') }}>
                      Add Link
                    </button>
                  )}
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleComplete(s.id)}
                    disabled={actionId === s.id}
                    style={{ color:'var(--success)', borderColor:'var(--success)' }}
                  >
                    {actionId === s.id ? <span className="spinner" /> : 'Mark Complete'}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleCancel(s.id)}
                    disabled={actionId === s.id}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length === 0 && confirmed.length === 0 && (
        <div className="empty-state">No upcoming sessions.</div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Past Sessions ({past.length})</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Subject</th><th>Student</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
              <tbody>
                {past.map(s => (
                  <tr key={s.id}>
                    <td style={{ color:'var(--text)' }}>{s.subject}</td>
                    <td>{s.student?.first_name} {s.student?.last_name}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{new Date(s.scheduled_date).toLocaleDateString()}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{s.start_time} – {s.end_time}</td>
                    <td><span className={`badge badge-${s.status === 'completed' ? 'green' : 'red'}`}>{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}