import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import Calendar from '../../components/Calendar'
import TimezoneSelector from '../../components/TimezoneSelector'
import api from '../../services/api'
import { Plus, X, Check, Globe } from 'lucide-react'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function AvailabilityManager({ onChanged, tutorTz, onTzChange }) {
  const [slots,     setSlots]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [addingDay, setAddingDay] = useState(null)
  const [form,      setForm]      = useState({ start_time: '09:00', end_time: '10:00' })
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')

  const load = () => {
    setLoading(true)
    api.get('/tutors/me/availability')
      .then(r => setSlots(r.data.data?.slots || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openDay = day => {
    setAddingDay(day)
    setForm({ start_time: '09:00', end_time: '10:00' })
    setErr('')
  }

  const addSlot = async day => {
    setErr('')
    if (form.start_time >= form.end_time) { setErr('End must be after start'); return }
    setSaving(true)
    try {
      await api.post('/tutors/me/availability', { day_of_week: day, ...form, recurring: true })
      setAddingDay(null)
      load()
      onChanged?.()
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const removeSlot = async id => {
    try {
      await api.delete(`/tutors/me/availability/${id}`)
      load()
      onChanged?.()
    } catch {}
  }

  const byDay = {}
  DAYS.forEach(d => { byDay[d] = [] })
  slots.forEach(s => { if (byDay[s.day_of_week]) byDay[s.day_of_week].push(s) })

  return (
    <div className="card" style={{ padding: 20, marginBottom: 24 }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>Weekly Availability</div>
          <div style={{ color: 'var(--text3)', fontSize: 12.5, marginTop: 2 }}>
            Click <strong>+ Add</strong> on any day to set a recurring time window for student bookings.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 20, background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: 12 }}>
          <Globe size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text2)' }}>Times in:</span>
          <TimezoneSelector
            value={tutorTz || ''}
            onChange={onTzChange}
            compact
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" role="status" aria-label="Loading" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {DAYS.map(day => {
            const daySlots = byDay[day]
            const active   = daySlots.length > 0
            const isOpen   = addingDay === day

            return (
              <div key={day} style={{
                borderRadius: 10,
                border: `1px solid ${active ? '#86efac' : 'var(--border)'}`,
                background: active ? '#f0fdf4' : 'var(--bg2)',
                padding: '10px 10px 8px',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                {/* Day label */}
                <div style={{ fontSize: 11, fontWeight: 700, color: active ? '#15803d' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 2 }}>
                  {day.slice(0, 3)}
                </div>

                {/* Existing slots */}
                {daySlots.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#dcfce7', borderRadius: 5, padding: '3px 6px' }}>
                    <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}
                    </span>
                    <button onClick={() => removeSlot(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 2px', display: 'flex', alignItems: 'center' }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}

                {/* Inline add form */}
                {isOpen ? (
                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {err && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{err}</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <input
                        type="time" value={form.start_time}
                        onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                        style={{ fontSize: 12, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border2)', background: '#fff', width: '100%' }}
                      />
                      <input
                        type="time" value={form.end_time}
                        onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                        style={{ fontSize: 12, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border2)', background: '#fff', width: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => addSlot(day)} disabled={saving}
                        style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        {saving ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <><Check size={11} /> Save</>}
                      </button>
                      <button
                        onClick={() => { setAddingDay(null); setErr('') }}
                        style={{ fontSize: 11, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => openDay(day)}
                    style={{ marginTop: 'auto', width: '100%', fontSize: 11, padding: '5px 0', borderRadius: 5, border: `1px dashed ${active ? '#86efac' : 'var(--border)'}`, background: 'transparent', color: active ? '#15803d' : 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontWeight: 600 }}>
                    <Plus size={11} /> Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {slots.length === 0 && !loading && (
        <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fcd34d', fontSize: 13, color: '#92400e' }}>
          No availability set yet. Click <strong>+ Add</strong> on any day above to get started.
        </div>
      )}
    </div>
  )
}

export default function TutorCalendarPage() {
  const { user, updateTimezone } = useAuth()
  const [calKey, setCalKey]      = useState(0)

  const tutorTz = user?.timezone || null

  const handleTzChange = async (tz) => {
    try { await updateTimezone(tz) } catch {}
    setCalKey(k => k + 1)
  }

  return (
    <div>
      <div className="dash-header">
        <div className="dash-title">My Calendar</div>
        <div className="dash-subtitle">
          Set your weekly availability below, then mark one-off busy slots on the calendar.
        </div>
      </div>

      <AvailabilityManager
        onChanged={() => setCalKey(k => k + 1)}
        tutorTz={tutorTz}
        onTzChange={handleTzChange}
      />

      <Calendar key={calKey} tutorId={user?.id} mode="manage" viewerTz={tutorTz} />
    </div>
  )
}
