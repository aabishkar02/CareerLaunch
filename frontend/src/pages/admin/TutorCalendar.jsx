// src/pages/admin/TutorCalendarAdmin.jsx
import { useState, useEffect } from 'react'
import api from '../../services/api'
import Calendar from '../../components/Calendar'

export default function TutorCalendarAdmin() {
  const [tutors, setTutors]         = useState([])
  const [selectedTutor, setSelected] = useState(null)
  const [loading, setLoading]        = useState(true)

  useEffect(() => {
    api.get('/admin/users?role=tutor')
      .then(r => {
        const list = r.data.data?.users || []
        setTutors(list)
        if (list.length > 0) setSelected(list[0])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><span className="spinner" role="status" aria-label="Loading" /></div>

  return (
    <div>
      <div className="dash-header">
        <div className="dash-title">Tutor Calendars</div>
        <div className="dash-subtitle">View availability, sessions, and busy slots for any tutor.</div>
      </div>

      {tutors.length === 0 ? (
        <div className="empty-state">No tutors registered yet.</div>
      ) : (
        <>
          {/* Tutor selector */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {tutors.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                style={{
                  padding: '8px 16px', borderRadius: 4,
                  border: `1px solid ${selectedTutor?.id === t.id ? 'var(--accent)' : 'var(--border2)'}`,
                  background: selectedTutor?.id === t.id ? 'var(--accent-dim)' : 'var(--bg3)',
                  color: selectedTutor?.id === t.id ? 'var(--accent)' : 'var(--text2)',
                  cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-mono)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: selectedTutor?.id === t.id ? 'var(--primary-light)' : 'var(--bg2)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--primary)' }}>
                  {t.first_name?.[0]}{t.last_name?.[0]}
                </span>
                {t.first_name} {t.last_name}
                {t.suspended && <span className="badge badge-red" style={{ fontSize: 10 }}>Suspended</span>}
              </button>
            ))}
          </div>

          {selectedTutor && (
            <>
              {/* Tutor info strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', color: 'var(--accent)', flexShrink: 0 }}>
                  {selectedTutor.first_name?.[0]}{selectedTutor.last_name?.[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text)' }}>{selectedTutor.first_name} {selectedTutor.last_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{selectedTutor.email}</div>
                </div>
                <span className={`badge badge-${selectedTutor.suspended ? 'red' : 'green'}`} style={{ marginLeft: 'auto' }}>
                  {selectedTutor.suspended ? 'Suspended' : 'Active'}
                </span>
              </div>

              <Calendar
                tutorId={selectedTutor.id}
                mode="view"
                studentName={`${selectedTutor.first_name} ${selectedTutor.last_name}`}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}