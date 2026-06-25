import { confirmDialog } from '../../components/ConfirmDialog'
import { toast } from '../../services/toast'
// src/pages/student/Sessions.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import { CheckCircle, X, Calendar, Star, Check, Globe, AlertCircle, Clock, CreditCard } from 'lucide-react'
import TimezoneSelector from '../../components/TimezoneSelector'
import useTabParam from '../../utils/useTabParam'
import {
  browserTz, tzShort,
  availabilityForDay,
  studentSlotToTutorTime,
  localToUTC, utcToHHMM,
} from '../../utils/timezone'

// ── Time helpers ─────────────────────────────────────────────
const HOURS      = Array.from({ length: 13 }, (_, i) => i + 8) // 8am–8pm
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getMonday(d) {
  const date = new Date(d)
  const day  = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  date.setHours(0, 0, 0, 0)
  return date
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function fmtDate(d)    { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}` }
function toMins(t)       { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function minutesToTime(m){ return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}` }
function isToday(d)      { return fmtDate(d) === fmtDate(new Date()) }
function isPast(d)       { return d < new Date(new Date().setHours(0, 0, 0, 0)) }
function isPastMins(d, startMins) {
  const now = new Date()
  return fmtDate(d) === fmtDate(now) && startMins < now.getHours() * 60 + now.getMinutes()
}

// ── StudentBookingCalendar ────────────────────────────────────
function StudentBookingCalendar({ tutor, moduleId, moduleDuration = 60, creditsRemaining = 0, onBooked }) {
  const { user, updateTimezone }  = useAuth()
  const navigate                  = useNavigate()
  // A session credit backs every booking. With none left, booking is disabled
  // up front (rather than letting the API reject it with a 402).
  const hasCredits = !moduleId || creditsRemaining > 0
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [calData, setCal]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [booking, setBooking]     = useState(null) // { date, start, end } in studentTz
  const [form, setForm]           = useState({ subject: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [bookErr, setBookErr]     = useState('')
  const [bookOk, setBookOk]       = useState(false)
  const scrollRef                 = useRef(null)

  // Timezone resolution: student sees their tz, tutor's times are converted from tutor's tz
  const studentTz = user?.timezone || browserTz()
  const tutorTz   = calData?.tutor_timezone || studentTz

  const month     = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}`
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const load = () => {
    if (!tutor?.id) return
    setLoading(true)
    api.get(`/tutors/${tutor.id}/calendar?month=${month}`)
      .then(r => setCal(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [tutor?.id, month])

  // Pre-convert busy slots and sessions from tutorTz to studentTz
  const convertedBusy = (calData?.busy_slots || []).map(b => {
    const ds = String(b.date).slice(0, 10)
    if (tutorTz === studentTz) return b
    const sUTC = localToUTC(ds, b.start_time, tutorTz)
    const eUTC = localToUTC(ds, b.end_time,   tutorTz)
    return { ...b, start_time: utcToHHMM(sUTC, studentTz), end_time: utcToHHMM(eUTC, studentTz) }
  })

  const convertedSessions = (calData?.sessions || []).map(s => {
    const ds = String(s.scheduled_date).slice(0, 10)
    if (tutorTz === studentTz) return s
    const sUTC = localToUTC(ds, s.start_time, tutorTz)
    const eUTC = localToUTC(ds, s.end_time,   tutorTz)
    const newDate = new Intl.DateTimeFormat('en-CA', { timeZone: studentTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sUTC))
    return { ...s, scheduled_date: newDate, start_time: utcToHHMM(sUTC, studentTz), end_time: utcToHHMM(eUTC, studentTz) }
  })

  // Build event map — all times in studentTz
  const eventMap = {}
  weekDates.forEach(date => {
    const key = fmtDate(date)
    eventMap[key] = []

    // Timezone-aware availability: find tutor's slots that overlap with this student date
    const availWindows = calData?.availability?.length
      ? availabilityForDay(key, studentTz, tutorTz, calData.availability)
      : []

    availWindows.forEach(w => {
      let start = toMins(w.start)
      const end = toMins(w.end)
      while (start + moduleDuration <= end) {
        const slotStart = minutesToTime(start)
        const slotEnd   = minutesToTime(start + moduleDuration)
        const isBooked  = convertedSessions.some(s =>
          String(s.scheduled_date).slice(0,10) === key &&
          toMins(s.start_time) < start + moduleDuration &&
          toMins(s.end_time)   > start
        )
        const isBusy    = convertedBusy.some(b =>
          String(b.date).slice(0,10) === key &&
          toMins(b.start_time) < start + moduleDuration &&
          toMins(b.end_time)   > start
        )
        if (!isBooked && !isBusy && !isPast(date) && !isPastMins(date, start)) {
          eventMap[key].push({ type: 'avail', start: slotStart, end: slotEnd })
        }
        start += moduleDuration
      }
    })

    // Busy slots (in studentTz)
    convertedBusy.forEach(b => {
      if (String(b.date).slice(0,10) === key)
        eventMap[key].push({ type: 'busy', start: b.start_time, end: b.end_time, label: 'Busy' })
    })

    // Sessions (in studentTz)
    convertedSessions.forEach(s => {
      if (String(s.scheduled_date).slice(0,10) === key) {
        const isBusyStatus = s.status === 'busy'
        eventMap[key].push({
          type:        isBusyStatus ? 'busy' : 'session',
          start:       s.start_time,
          end:         s.end_time,
          label:       isBusyStatus ? 'Busy' : (s.subject || 'Session'),
          isConfirmed: !isBusyStatus && s.status === 'confirmed',
        })
      }
    })
  })

  const getCellState = (dateKey, hour) => {
    const startMins = hour * 60
    const endMins   = startMins + moduleDuration
    const cellDate  = new Date(dateKey + 'T12:00:00')
    if (isPast(cellDate) || isPastMins(cellDate, startMins)) return 'past'
    // Use pre-converted eventMap (all times already in studentTz)
    const dayEvents = eventMap[dateKey] || []
    const inAvail   = dayEvents.some(e => e.type === 'avail'   && toMins(e.start) <= startMins && toMins(e.end) >= endMins)
    const inBusy    = dayEvents.some(e => e.type === 'busy'    && toMins(e.start) < endMins && toMins(e.end) > startMins)
    const inBooked  = dayEvents.some(e => e.type === 'session' && toMins(e.start) < endMins && toMins(e.end) > startMins)
    if (inBooked) return 'booked'
    if (inBusy)   return 'busy'
    if (inAvail)  return 'open'
    return 'off'
  }

  const getEvPos = (start, end) => {
    const s = toMins(start) - 8 * 60
    const e = toMins(end)   - 8 * 60
    const t = 12 * 60
    return { top: `${(s / t) * 100}%`, height: `${Math.max(((e - s) / t) * 100, 1.5)}%` }
  }

  const openBooking = (dateKey, startStr, endStr) => {
    setBooking({ date: dateKey, start: startStr, end: endStr })
    setForm({ subject: '', notes: '' })
    setBookErr(''); setBookOk(false)
  }

  const handleCellClick = (date, hour, state) => {
    if (state !== 'open' || !hasCredits) return
    const dateKey    = fmtDate(date)
    const startMins  = hour * 60
    const endMins    = startMins + moduleDuration
    openBooking(dateKey, minutesToTime(startMins), minutesToTime(endMins))
  }

  const handleBook = async (e) => {
    e.preventDefault()
    if (!form.subject.trim()) return
    setSubmitting(true); setBookErr('')
    try {
      // Convert the selected slot from studentTz back to tutorTz for storage
      const apiSlot = studentSlotToTutorTime(booking.date, booking.start, booking.end, studentTz, tutorTz)
      await api.post('/sessions/request', {
        tutor_id:       tutor.id,
        module_id:      moduleId || undefined,
        scheduled_date: apiSlot.scheduled_date,
        start_time:     apiSlot.start_time,
        end_time:       apiSlot.end_time,
        subject:        form.subject,
        notes:          form.notes || undefined,
      })
      setBookOk(true)
      setTimeout(() => { setBooking(null); setBookOk(false); load(); if (onBooked) onBooked() }, 2200)
    } catch (err) {
      // Surface the "no credits" case distinctly so the student knows to buy more.
      if (err.response?.status === 402 || err.response?.data?.noCredits) {
        setBookErr('You have no session credits left for this module. Purchase a plan to book more.')
      } else {
        setBookErr(err.response?.data?.error || 'Failed to book. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const nowMins     = new Date().getHours() * 60 + new Date().getMinutes() - 8 * 60
  const nowPct      = `${(nowMins / (12 * 60)) * 100}%`
  const isThisWeek  = weekDates.some(d => isToday(d))

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
            {MONTHS[weekStart.getMonth()]} {weekStart.getFullYear()}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            Click a green slot to request a session
          </span>
          {/* Timezone indicator + selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Globe size={11} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Your TZ:</span>
            <TimezoneSelector
              value={studentTz}
              onChange={async (tz) => { try { await updateTimezone(tz) } catch {} }}
              compact
            />
          </div>
          {tutorTz !== studentTz && (
            <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
              (Tutor: {tzShort(tutorTz)})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(getMonday(new Date()))}>Today</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const candidate = addDays(weekStart, -7)
              if (candidate >= getMonday(new Date())) setWeekStart(candidate)
            }}
            disabled={addDays(weekStart, -7) < getMonday(new Date())}
            style={{ opacity: addDays(weekStart, -7) < getMonday(new Date()) ? 0.3 : 1, cursor: addDays(weekStart, -7) < getMonday(new Date()) ? 'not-allowed' : 'pointer' }}
          >‹</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(d => addDays(d,  7))}>›</button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, flexWrap: 'wrap' }}>
        {[
          { bg: '#dcfce7', border: '#16a34a', label: `Available (${moduleDuration} min) — click to book` },
          { bg: '#dbeafe', border: '#93c5fd', label: 'Your confirmed session' },
          { bg: '#fef2f2', border: '#fca5a5', label: 'Unavailable / busy' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 2, background: l.bg, border: `1px solid ${l.border}`, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: 'var(--text3)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* ── No-credits banner ── */}
      {!hasCredits && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginBottom: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 'var(--radius-md)' }}>
          <CreditCard size={20} style={{ color: '#c2410c', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412' }}>You're out of session credits for this module</div>
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>Purchase a plan to unlock more 1-on-1 sessions. Booking is disabled until you have credits.</div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => navigate('/plans')}>
            Buy more credits
          </button>
        </div>
      )}

      {/* ── Grid ── */}
      <div style={{ position: 'relative', background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)', opacity: hasCredits ? 1 : 0.55, pointerEvents: hasCredits ? 'auto' : 'none' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7,1fr)', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <div style={{ borderRight: '1px solid var(--border)' }} />
          {weekDates.map((date, i) => (
            <div key={i} style={{ padding: '10px 6px', textAlign: 'center', borderRight: i < 6 ? '1px solid var(--border)' : 'none', background: isToday(date) ? 'var(--primary-light)' : 'transparent' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{DAYS_SHORT[i]}</div>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: isToday(date) ? 'var(--primary)' : 'transparent',
                color: isToday(date) ? 'white' : isPast(date) ? 'var(--text3)' : 'var(--text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto', fontWeight: isToday(date) ? 700 : 400, fontSize: 14,
              }}>{date.getDate()}</div>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div style={{ overflowY: 'auto', maxHeight: '62vh', position: 'relative' }} ref={scrollRef}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.6)', zIndex: 20 }}>
              <span className="spinner" />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7,1fr)', position: 'relative' }}>
            {/* Time labels */}
            <div>
              {HOURS.map(h => (
                <div key={h} style={{ height: 60, borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '4px 8px 0 0' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDates.map((date, di) => {
              const dateKey = fmtDate(date)
              const events  = eventMap[dateKey] || []
              return (
                <div key={di} style={{ position: 'relative', borderRight: di < 6 ? '1px solid var(--border)' : 'none' }}>
                  {HOURS.map(h => {
                    const state   = getCellState(dateKey, h)
                    const canBook = state === 'open'
                    return (
                      <div
                        key={h}
                        onClick={() => handleCellClick(date, h, state)}
                        style={{
                          height: 60,
                          borderBottom: '1px solid var(--border)',
                          background:
                            state === 'open'   ? '#f0fdf4' :
                            state === 'booked' ? '#eff6ff' :
                            state === 'busy'   ? '#fef2f2' :
                            state === 'past'   ? 'var(--bg3)' :
                            isPast(date)       ? 'var(--bg3)' :
                            'transparent',
                          cursor: canBook ? 'pointer' : 'default',
                          transition: 'background 0.1s',
                          position: 'relative',
                        }}
                        onMouseEnter={e => { if (canBook) e.currentTarget.style.background = '#dcfce7' }}
                        onMouseLeave={e => { if (canBook) e.currentTarget.style.background = '#f0fdf4' }}
                        title={canBook ? 'Click to request a session' : ''}
                      />
                    )
                  })}

                  {/* Events overlay */}
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {events.map((ev, ei) => {
                      const { top, height } = getEvPos(ev.start, ev.end)
                      const isAvail = ev.type === 'avail'
                      const colors =
                        isAvail          ? { bg: '#dcfce7', border: '#16a34a', text: '#15803d' } :
                        ev.type === 'busy' ? { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c' } :
                        ev.isConfirmed   ? { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' } :
                                           { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' }
                      return (
                        <div
                          key={ei}
                          onClick={() => isAvail && openBooking(dateKey, ev.start, ev.end)}
                          onMouseEnter={e => { if (isAvail) e.currentTarget.style.filter = 'brightness(0.93)' }}
                          onMouseLeave={e => { if (isAvail) e.currentTarget.style.filter = 'none' }}
                          style={{
                            position: 'absolute', left: 2, right: 2, top, height,
                            background: colors.bg, border: `1px solid ${colors.border}`,
                            borderLeft: `3px solid ${colors.border}`,
                            borderRadius: 3, padding: '3px 6px', overflow: 'hidden',
                            zIndex: ev.type === 'session' ? 3 : isAvail ? 2 : 1,
                            pointerEvents: isAvail ? 'auto' : 'none',
                            cursor: isAvail ? 'pointer' : 'default',
                            transition: 'filter 0.1s',
                          }}
                          title={isAvail ? `Book ${ev.start}–${ev.end}` : ev.label}
                        >
                          <div style={{ fontSize: 10, fontWeight: 700, color: colors.text, lineHeight: 1.3 }}>
                            {isAvail ? 'Book' : ev.label}
                          </div>
                          <div style={{ fontSize: 9, color: colors.text, opacity: 0.7 }}>{ev.start}–{ev.end}</div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Now line */}
                  {isToday(date) && isThisWeek && nowMins >= 0 && nowMins <= 12 * 60 && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: nowPct, height: 2, background: 'var(--primary)', zIndex: 10, pointerEvents: 'none' }}>
                      <div style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Booking modal ── */}
      {booking && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBooking(null)}>
          <div className="modal">
            {bookOk ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}><CheckCircle size={48} color="var(--success)" strokeWidth={1.5} /></div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>Session booked!</div>
                <div style={{ fontSize: 14, color: 'var(--text3)' }}>Confirmed. Your tutor will add a meeting link shortly.</div>
              </div>
            ) : (
              <>
                <div className="modal-header">
                  <div>
                    <div className="modal-title">Request a Session</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
                      {booking.date} · {booking.start} – {booking.end}
                      {' '}({tzShort(studentTz)})
                      {' '}with {tutor.first_name} {tutor.last_name}
                    </div>
                  </div>
                  <button className="modal-close" onClick={() => setBooking(null)}><X size={14} /></button>
                </div>

                {bookErr && <div className="alert alert-error">{bookErr}</div>}

                <form onSubmit={handleBook}>
                  <div className="form-group">
                    <label className="form-label">What do you want to cover? *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Resume review, LinkedIn optimisation, mock interview"
                      value={form.subject}
                      onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes (optional)</label>
                    <textarea
                      className="form-input"
                      rows={3}
                      placeholder="Anything specific to prepare for this session?"
                      value={form.notes}
                      onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setBooking(null)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={!form.subject || submitting}>
                      {submitting ? <><span className="spinner" /> Sending...</> : 'Send Request'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── RateTutorModal ────────────────────────────────────────────
function RateTutorModal({ session, onClose, onRated }) {
  const [rating,  setRating]  = useState(0)
  const [hover,   setHover]   = useState(0)
  const [text,    setText]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)

  useEffect(() => { if (session) { setRating(0); setHover(0); setText(''); setDone(false) } }, [session])

  if (!session) return null
  const tutorId   = session.tutor_id || session.tutor?.id
  const tutorName = session.tutor_name || `${session.tutor?.first_name || ''} ${session.tutor?.last_name || ''}`.trim() || 'your mentor'

  const submit = async () => {
    if (!rating || !tutorId) return
    setSaving(true)
    try {
      await api.post(`/onboarding/tutors/${tutorId}/review`, { rating, review_text: text || undefined, session_id: session.id })
      setDone(true)
      onRated(session.id)
    } catch (e) {
      const code = e.response?.data?.error
      if (code === 'already_rated') { setDone(true); onRated(session.id) }
      else toast.error(e.response?.data?.error || 'Failed to submit rating')
    } finally { setSaving(false) }
  }

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(24,23,31,.42)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 22, boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-display)' }}>Rate your session</div>
          <button onClick={onClose} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', borderRadius: 8 }}><X size={18} /></button>
        </div>
        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><Check size={28} strokeWidth={2.5} /></div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Thanks for your feedback!</div>
            <div style={{ color: 'var(--text3)', fontSize: 14, marginTop: 6 }}>Your review helps others find great mentors.</div>
            <button className="btn btn-primary" style={{ marginTop: 22, width: '100%' }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>How was your session with <strong>{tutorName}</strong>?</p>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 22 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                  <Star size={36} fill={(hover || rating) >= n ? 'var(--credit)' : 'none'} strokeWidth={1.5}
                    style={{ color: (hover || rating) >= n ? 'var(--credit)' : 'var(--border)', transition: 'color .12s' }} />
                </button>
              ))}
            </div>
            <div className="field">
              <label>Review <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="form-input" rows={3} placeholder="What made this session great, or how could it improve?" value={text} onChange={e => setText(e.target.value)} style={{ resize: 'none' }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} disabled={!rating || saving} onClick={submit}>
              {saving ? <><span className="spinner" /> Submitting…</> : 'Submit rating'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── CancelRequestModal ───────────────────────────────────────
function CancelRequestModal({ session, onClose, onRequested }) {
  const [reason, setReason]     = useState('')
  const [sending, setSending]   = useState(false)
  const [err, setErr]           = useState('')
  const [done, setDone]         = useState(false)
  const { user } = useAuth()

  const submit = async () => {
    setSending(true); setErr('')
    try {
      await api.post(`/sessions/${session.id}/cancel-request`, { reason })
      setDone(true)
      onRequested(session.id)
    } catch (e) { setErr(e.response?.data?.error || 'Failed to send request.') }
    finally { setSending(false) }
  }

  if (!session) return null

  const studentTz = user?.timezone || browserTz()
  const tutorTz   = session.tutor_timezone || studentTz
  const ds        = String(session.scheduled_date).slice(0, 10)
  const displayStart = (session.start_time && tutorTz !== studentTz)
    ? utcToHHMM(localToUTC(ds, session.start_time, tutorTz), studentTz)
    : session.start_time

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(24,23,31,.42)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 22, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fef2f2', color: 'var(--danger)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><Check size={26} strokeWidth={2.5} /></div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Request sent</div>
            <div style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 22 }}>An admin has been notified and will review your request shortly.</div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 17, fontFamily: 'var(--font-display)' }}>Request cancellation</div>
              <button onClick={onClose} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', borderRadius: 8 }}><X size={18} /></button>
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Clock size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>This session is within 24 hours. You can request an admin to cancel it — a reason helps speed up the review.</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
              <strong>{session.subject}</strong> · {new Date(session.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {displayStart}
            </div>
            <div className="field" style={{ marginBottom: 18 }}>
              <label>Reason <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(recommended)</span></label>
              <textarea className="form-input" rows={3} placeholder="Why do you need to cancel?" value={reason} onChange={e => setReason(e.target.value)} style={{ resize: 'none' }} />
            </div>
            {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <button className="btn btn-primary" style={{ width: '100%', background: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={sending} onClick={submit}>
              {sending ? <><span className="spinner" /> Sending…</> : 'Send cancellation request'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── SessionCard ──────────────────────────────────────────────
function SessionCard({ session, onCancel, cancelling, onRate, onRequestCancel }) {
  const { user } = useAuth()
  const studentTz = user?.timezone || browserTz()
  const tutorTz   = session.tutor_timezone || studentTz
  const ds        = String(session.scheduled_date).slice(0, 10)
  const sUTC      = (session.start_time && tutorTz !== studentTz) ? localToUTC(ds, session.start_time, tutorTz) : null
  const displayDate  = sUTC
    ? new Intl.DateTimeFormat('en-CA', { timeZone: studentTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sUTC))
    : ds
  const displayStart = sUTC ? utcToHHMM(sUTC, studentTz) : session.start_time
  const displayEnd   = (session.end_time && tutorTz !== studentTz)
    ? utcToHHMM(localToUTC(ds, session.end_time, tutorTz), studentTz)
    : session.end_time

  const isPending   = session.status === 'pending'
  const isConfirmed = session.status === 'confirmed'
  const isCompleted = session.status === 'completed'
  const isCancelled = session.status === 'cancelled'

  // Check if the session is within 24 hours
  const hoursUntil = (() => {
    const dateStr = (session.scheduled_date || '').substring(0, 10)
    if (!dateStr || !session.start_time) return Infinity
    const dt = new Date(`${dateStr}T${session.start_time}:00Z`)
    return (dt - Date.now()) / (1000 * 60 * 60)
  })()
  const isWithin24h = hoursUntil < 24

  const statusStyle = {
    pending:   { badge: 'badge-yellow', bg: '#fffbeb', border: '#fcd34d' },
    confirmed: { badge: 'badge-green',  bg: '#f0fdf4', border: '#86efac' },
    completed: { badge: 'badge-blue',   bg: '#f0f9ff', border: '#bae6fd' },
    cancelled: { badge: 'badge-red',    bg: '#fef2f2', border: '#fca5a5' },
  }[session.status] || { badge: 'badge-gray', bg: 'white', border: 'var(--border)' }

  const fmtD = d => new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div style={{ background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, borderRadius: 'var(--radius-md)', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span className={`badge ${statusStyle.badge}`}>{session.status}</span>
          {session.cancel_requested && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
              <Clock size={11} /> Cancellation Requested
            </span>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{session.subject}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 3 }}>
          {fmtD(displayDate)} · {displayStart} – {displayEnd}
          {session.tutor && ` · ${session.tutor.first_name} ${session.tutor.last_name}`}
        </div>
        {session.notes && (
          <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>"{session.notes}"</div>
        )}
        {isCompleted && session.tutor_notes && (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, padding: '6px 10px', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text3)' }}>TUTOR NOTES: </span>{session.tutor_notes}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
        {session.meeting_link && (isConfirmed || isPending) && (
          <a href={session.meeting_link} target="_blank" rel="noopener noreferrer">
            <button className="btn btn-primary btn-sm">Join Meeting</button>
          </a>
        )}
        {isCompleted && (
          session.has_review
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)', padding: '4px 8px', background: 'var(--bg2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}><Star size={12} fill="var(--credit)" style={{ color: 'var(--credit)' }} /> Rated</span>
            : <button className="btn btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => onRate(session)}><Star size={12} /> Rate</button>
        )}
        {(isPending || isConfirmed) && !session.cancel_requested && (
          isWithin24h ? (
            <button
              className="btn btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#92400e', border: '1px solid #fcd34d', background: '#fffbeb' }}
              onClick={() => onRequestCancel(session)}
              disabled={cancelling === session.id}
            >
              <AlertCircle size={13} /> Request Cancel
            </button>
          ) : (
            <button
              className="btn btn-sm"
              style={{ color: 'var(--danger)', border: '1px solid #fca5a5', background: 'transparent' }}
              onClick={() => onCancel(session.id)}
              disabled={cancelling === session.id}
            >
              {cancelling === session.id ? <span className="spinner" /> : 'Cancel'}
            </button>
          )
        )}
        {(isPending || isConfirmed) && session.cancel_requested && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#92400e', padding: '4px 10px', background: '#fef3c7', borderRadius: 'var(--radius-sm)', border: '1px solid #fcd34d' }}>
            <Clock size={12} /> Pending admin review
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────
export default function StudentSessions() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [moduleEnrollments, setModuleEnrollments] = useState([])
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [selectedModuleId, setSelectedModuleId] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [tab, setTab]             = useTabParam('upcoming')
  const [msg, setMsg]             = useState('')
  const [rateSession, setRateSession]       = useState(null)
  const [requestCancelSession, setRequestCancelSession] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [sessR, meR] = await Promise.all([
        api.get('/sessions/my'),
        api.get('/students/me/module-enrollments'),
      ])
      const all  = sessR.data.data?.sessions || []
      setSessions(all)
      const me = (meR.data.data?.enrollments || []).filter(e => e.status === 'active' && e.tutor)
      setModuleEnrollments(me)
      if (me.length > 0 && !selectedModuleId) setSelectedModuleId(me[0].module_id)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const handleCancel = async (id) => {
    if (!(await confirmDialog('Cancel this session? Your tutor will be notified.'))) return
    setCancelling(id)
    try { await api.patch(`/sessions/${id}/cancel`, { reason: 'Cancelled by student' }); load() }
    catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setCancelling(null) }
  }

  const handleRequested = (sessionId) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, cancel_requested: true } : s))
  }

  const handleRated = (sessionId) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, has_review: true } : s))
  }

  const upcoming  = sessions.filter(s => ['pending', 'confirmed'].includes(s.status))
  const past      = sessions.filter(s => ['completed', 'cancelled'].includes(s.status))
  const pending   = sessions.filter(s => s.status === 'pending')
  const confirmed = sessions.filter(s => s.status === 'confirmed')
  const completed = sessions.filter(s => s.status === 'completed')

  const selectedME = moduleEnrollments.find(me => me.module_id === selectedModuleId)

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  return (
    <div>
      <RateTutorModal session={rateSession} onClose={() => setRateSession(null)} onRated={handleRated} />
      {requestCancelSession && (
        <CancelRequestModal
          session={requestCancelSession}
          onClose={() => setRequestCancelSession(null)}
          onRequested={handleRequested}
        />
      )}
      <div className="dash-header">
        <div className="dash-title">My Sessions</div>
        <div className="dash-subtitle">
          {upcoming.length} upcoming · {completed.length} completed
        </div>
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}

      {/* No tutor state */}
      {moduleEnrollments.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Calendar size={32} color="var(--accent)" /></div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>No active module enrolments</div>
          <div style={{ fontSize: 14, color: 'var(--text3)', maxWidth: 380, lineHeight: 1.6, marginBottom: 20 }}>
            You need to purchase a plan and be assigned a tutor before you can book sessions. Complete your onboarding first.
          </div>
          <a href="/dashboard/onboarding"><button className="btn btn-primary">Complete onboarding →</button></a>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 24 }}>
            {[
              { val: upcoming.length,  label: 'Upcoming',  color: 'var(--success)' },
              { val: completed.length, label: 'Completed', color: 'var(--primary)' },
              { val: sessions.filter(s=>s.status==='cancelled').length, label: 'Cancelled', color: 'var(--text3)' },
              { val: sessions.length,  label: 'Total',     color: 'var(--text2)' },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ textAlign: 'center' }}>
                <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Module + credit selector */}
          {moduleEnrollments.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <span className="card-title">Book a Session</span>
                {moduleEnrollments.length > 1 && (
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>Select module to book for:</span>
                )}
              </div>

              {moduleEnrollments.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {moduleEnrollments.map(me => (
                    <button
                      key={me.module_id}
                      onClick={() => setSelectedModuleId(me.module_id)}
                      style={{
                        padding: '8px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13,
                        border: `2px solid ${selectedModuleId === me.module_id ? 'var(--primary)' : 'var(--border)'}`,
                        background: selectedModuleId === me.module_id ? 'var(--primary-light)' : 'white',
                        color: selectedModuleId === me.module_id ? 'var(--primary)' : 'var(--text2)',
                        fontWeight: selectedModuleId === me.module_id ? 600 : 400,
                        transition: 'all 0.15s',
                      }}
                    >
                      M{String(me.module?.order_index || 0).padStart(2, '0')} {me.module?.title}
                    </button>
                  ))}
                </div>
              )}

              {selectedME && (
                <>
                  {/* Credit balance */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'var(--bg2)', borderRadius: 'var(--radius-sm)', marginBottom: 16, border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                        {selectedME.module?.title || 'Module'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                        Tutor: {selectedME.tutor?.first_name} {selectedME.tutor?.last_name}
                      </div>
                      {selectedME.credits_granted > 0 && (
                        selectedME.credits_remaining > 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 2 }}>
                            {selectedME.credits_remaining} session credit{selectedME.credits_remaining !== 1 ? 's' : ''} remaining
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>No credits remaining</span>
                            <button className="btn btn-primary btn-sm" onClick={() => navigate('/plans')}>Buy more credits</button>
                          </div>
                        )
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{selectedME.credits_remaining ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>credits left</div>
                    </div>
                  </div>

                  {/* Calendar */}
                  {selectedME.tutor ? (
                    <StudentBookingCalendar
                      tutor={selectedME.tutor}
                      moduleId={selectedME.module_id}
                      moduleDuration={selectedME.module?.duration_minutes || 60}
                      creditsRemaining={selectedME.credits_remaining ?? 0}
                      onBooked={() => { setMsg('Session booked! It is confirmed and appears in your upcoming sessions.'); load() }}
                    />
                  ) : (
                    <div className="alert alert-info">No tutor assigned to this module yet. Contact admin to get a tutor assigned.</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Sessions tabs */}
          <div className="card">
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'upcoming', label: `Upcoming (${upcoming.length})` },
                { key: 'past',     label: `Past (${past.length})`     },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`tab-btn${tab === t.key ? ' active' : ''}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'upcoming' && (
              upcoming.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><Calendar size={32} /></div>
                  <div className="empty-msg">No upcoming sessions. Book one using the calendar above.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {upcoming.map(s => (
                    <SessionCard key={s.id} session={s} onCancel={handleCancel} cancelling={cancelling} onRate={setRateSession} onRequestCancel={setRequestCancelSession} />
                  ))}
                </div>
              )
            )}

            {tab === 'past' && (
              past.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><Calendar size={32} /></div>
                  <div className="empty-msg">No past sessions yet.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {past.map(s => (
                    <SessionCard key={s.id} session={s} onCancel={handleCancel} cancelling={cancelling} onRate={setRateSession} onRequestCancel={setRequestCancelSession} />
                  ))}
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}
