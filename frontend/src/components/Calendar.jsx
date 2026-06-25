import { confirmDialog } from './ConfirmDialog'
import { toast } from '../services/toast'
// src/components/Calendar.jsx
// Reusable Teams-style calendar — used in student, tutor, and admin pages
// Props:
//   tutorId       — whose calendar to load (required)
//   mode          — 'view' | 'book' | 'manage'
//                   view   = read only (admin viewing tutor)
//                   book   = student can click free slot to request
//                   manage = tutor can mark busy / add slots
//   onBook        — callback(date, slot) when student books
//   studentName   — optional, shown in header
//   viewerTz      — IANA timezone of the viewer (defaults to browser TZ)
//                   times are displayed in this timezone

import { useState, useEffect, useRef, useMemo } from 'react'
import api from '../services/api'
import { CheckCircle, X, Globe } from 'lucide-react'
import {
  browserTz, tzShort,
  availabilityForDay,
  localToUTC, utcToHHMM,
} from '../utils/timezone'

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8)  // 8am – 8pm
const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmt(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export default function Calendar({ tutorId, mode = 'view', onBook, studentName, viewerTz: propViewerTz }) {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [calData, setCalData]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState('week') // 'week' | 'day'
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [hoveredSlot, setHoveredSlot] = useState(null)
  const [bookingSlot, setBookingSlot] = useState(null) // { date, start, end }
  const [bookForm, setBookForm]   = useState({ subject: '', notes: '' })
  const [bookErr, setBookErr]     = useState('')
  const [bookLoading, setBookLoading] = useState(false)
  const [bookSuccess, setBookSuccess] = useState(false)
  const [busyForm, setBusyForm]   = useState({ date: '', start_time: '09:00', end_time: '10:00', reason: '' })
  const [showBusyForm, setShowBusyForm] = useState(false)
  const [savingBusy, setSavingBusy] = useState(false)
  const gridRef = useRef(null)

  const monthStr = weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // ── Timezone setup ──────────────────────────────────────────
  const viewerTz = propViewerTz || browserTz()
  const tutorTz  = calData?.tutor_timezone || viewerTz // if tutor hasn't set TZ, assume same as viewer
  const tzsDiffer = viewerTz !== tutorTz

  // Pre-convert busy slots & sessions to viewerTz so all event logic uses same TZ
  const convertedBusy = useMemo(() => {
    if (!calData || !tzsDiffer) return calData?.busy_slots || []
    return (calData.busy_slots || []).map(b => {
      const ds = String(b.date).slice(0, 10)
      const sUTC = localToUTC(ds, b.start_time, tutorTz)
      const eUTC = localToUTC(ds, b.end_time,   tutorTz)
      return { ...b, start_time: utcToHHMM(sUTC, viewerTz), end_time: utcToHHMM(eUTC, viewerTz) }
    })
  }, [calData, viewerTz, tutorTz, tzsDiffer])

  const convertedSessions = useMemo(() => {
    if (!calData || !tzsDiffer) return calData?.sessions || []
    return (calData.sessions || []).map(s => {
      const ds = String(s.scheduled_date).slice(0, 10)
      const sUTC = localToUTC(ds, s.start_time, tutorTz)
      const eUTC = localToUTC(ds, s.end_time,   tutorTz)
      // date may shift when converting across midnight
      const newDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: viewerTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sUTC))
      return { ...s, scheduled_date: newDateStr, start_time: utcToHHMM(sUTC, viewerTz), end_time: utcToHHMM(eUTC, viewerTz) }
    })
  }, [calData, viewerTz, tutorTz, tzsDiffer])

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const month = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    if (!tutorId) return
    setLoading(true)
    api.get(`/tutors/${tutorId}/calendar?month=${month}`)
      .then(r => setCalData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [tutorId, month])

  const currentMonday = getMonday(new Date())
  const isViewingPast = weekStart < currentMonday
  const prevWeek = () => {
    const candidate = addDays(weekStart, -7)
    if (mode === 'book' && candidate < currentMonday) return
    setWeekStart(candidate)
  }
  const nextWeek = () => setWeekStart(d => addDays(d, 7))
  const goToday  = () => setWeekStart(getMonday(new Date()))

  // Build a map: dateKey → list of events { type, start, end, label, color, session }
  // All times are in viewerTz
  const eventMap = {}

  // Availability blocks (green) — only for today/future dates
  const todayStr = fmt(new Date())
  weekDates.forEach(date => {
    const key = fmt(date)
    if (!eventMap[key]) eventMap[key] = []
    if (key < todayStr) return  // skip availability for past dates
    const windows = calData?.availability?.length
      ? availabilityForDay(key, viewerTz, tutorTz, calData.availability)
      : []
    windows.forEach(w => {
      eventMap[key].push({
        type:  'available',
        start: w.start,
        end:   w.end,
        label: 'Available',
        bg:    '#f0fdf4',
        border:'#86efac',
        text:  '#15803d',
      })
    })
  })

  // Busy slots (red) — already converted to viewerTz
  convertedBusy.forEach(b => {
    const key = String(b.date).slice(0, 10)
    if (!eventMap[key]) eventMap[key] = []
    eventMap[key].push({
      type:  'busy',
      start: b.start_time,
      end:   b.end_time,
      label: mode === 'book' ? 'Busy' : (b.reason || 'Busy'),
      bg:    '#fef2f2',
      border:'#fca5a5',
      text:  '#b91c1c',
      id:    b.id,
    })
  })

  // Sessions — already converted to viewerTz
  convertedSessions.forEach(s => {
    const key = String(s.scheduled_date).slice(0, 10)
    if (!eventMap[key]) eventMap[key] = []
    if (s.status === 'busy') {
      eventMap[key].push({
        type:   'busy',
        start:  s.start_time,
        end:    s.end_time,
        label:  'Busy',
        bg:     '#fef2f2',
        border: '#fca5a5',
        text:   '#b91c1c',
      })
    } else {
      const isCompleted = s.status === 'completed'
      const isConfirmed = s.status === 'confirmed'
      const studentLabel = s.student
        ? (s.student.username ? `@${s.student.username}` : `${s.student.first_name} ${s.student.last_name}`)
        : ''
      const moduleLabel  = s.module?.name || ''
      eventMap[key].push({
        type:      'session',
        start:     s.start_time,
        end:       s.end_time,
        label:     s.subject || 'Session',
        sublabel:  studentLabel,
        sublabel2: moduleLabel,
        bg:        isCompleted ? '#f3f4f6' : isConfirmed ? '#eff6ff' : '#fffbeb',
        border:    isCompleted ? '#9ca3af' : isConfirmed ? '#93c5fd' : '#fcd34d',
        text:      isCompleted ? '#4b5563' : isConfirmed ? '#1d4ed8' : '#92400e',
        session:   s,
        completed: isCompleted,
      })
    }
  })

  const isToday    = (date) => fmt(date) === fmt(new Date())
  const isPast     = (date) => date < new Date(new Date().setHours(0,0,0,0))
  // Returns true if a specific hour cell on a given date is already in the past
  const isPastHour = (date, hour) => {
    const slot = new Date(date)
    slot.setHours(hour, 0, 0, 0)
    return slot < new Date()
  }
  // Returns true if a specific HH:MM time on a given date is already in the past
  const isSlotPast = (date, timeStr) => {
    const [h, m] = timeStr.split(':').map(Number)
    const d = new Date(date)
    d.setHours(h, m, 0, 0)
    return d < new Date()
  }

  // Position event in grid (percentage from top of hour block)
  const getEventStyle = (event) => {
    const startMins = timeToMinutes(event.start) - 8 * 60  // offset from 8am
    const endMins   = timeToMinutes(event.end)   - 8 * 60
    const totalMins = 12 * 60  // 8am–8pm = 720 mins
    const top    = (startMins / totalMins) * 100
    const height = ((endMins - startMins) / totalMins) * 100
    return { top: `${top}%`, height: `${height}%` }
  }

  const handleSlotClick = (date, hour) => {
    if (mode === 'book') {
      if (isPast(date) || isPastHour(date, hour)) return
      const dateKey   = fmt(date)
      const dayName   = date.toLocaleDateString('en-US', { weekday: 'long' })
      const daySlots  = calData?.availability?.filter(a => a.day_of_week === dayName) || []
      const clickMins = hour * 60
      const slot      = daySlots.find(s => timeToMinutes(s.start_time) <= clickMins && timeToMinutes(s.end_time) > clickMins)
      const isBusy    = (calData?.busy_slots || []).some(b => String(b.date).slice(0,10) === dateKey && timeToMinutes(b.start_time) <= clickMins && timeToMinutes(b.end_time) > clickMins)
      const isBooked  = (calData?.sessions  || []).some(s => String(s.scheduled_date).slice(0,10) === dateKey && timeToMinutes(s.start_time) <= clickMins && timeToMinutes(s.end_time) > clickMins)
      if (!slot || isBusy || isBooked) return
      setBookingSlot({ date: dateKey, start: slot.start_time, end: slot.end_time })
      setBookErr('')
      setBookSuccess(false)
      setBookForm({ subject: '', notes: '' })
    } else if (mode === 'manage') {
      if (isPastHour(date, hour)) return
      const dateKey   = fmt(date)
      const clickMins = hour * 60
      // If a session covers this slot, don't interfere
      const hasSession = (calData?.sessions || []).some(s => String(s.scheduled_date).slice(0,10) === dateKey && timeToMinutes(s.start_time) <= clickMins && timeToMinutes(s.end_time) > clickMins)
      if (hasSession) return
      // If a busy slot covers this cell, the event overlay div handles removal — skip here
      const hasBusy = (calData?.busy_slots || []).some(b => String(b.date).slice(0,10) === dateKey && timeToMinutes(b.start_time) <= clickMins && timeToMinutes(b.end_time) > clickMins)
      if (hasBusy) return
      // Pre-fill busy form with clicked date + hour and open
      const startTime = `${String(hour).padStart(2, '0')}:00`
      const endTime   = `${String(Math.min(hour + 1, 20)).padStart(2, '0')}:00`
      setBusyForm({ date: dateKey, start_time: startTime, end_time: endTime, reason: '' })
      setShowBusyForm(true)
    }
  }

  const handleBook = async (e) => {
    e.preventDefault()
    setBookErr('')
    setBookLoading(true)
    try {
      await api.post('/sessions/request', {
        tutor_id:       tutorId,
        scheduled_date: bookingSlot.date,
        start_time:     bookingSlot.start,
        end_time:       bookingSlot.end,
        subject:        bookForm.subject,
        notes:          bookForm.notes || undefined,
      })
      setBookSuccess(true)
      setTimeout(() => { setBookingSlot(null); setBookSuccess(false) }, 2000)
      if (onBook) onBook(bookingSlot.date, bookingSlot)
      // Refresh
      const r = await api.get(`/tutors/${tutorId}/calendar?month=${month}`)
      setCalData(r.data.data)
    } catch (err) {
      setBookErr(err.response?.data?.error || 'Failed to book session')
    } finally {
      setBookLoading(false)
    }
  }

  const handleMarkBusy = async (e) => {
    e.preventDefault()
    setSavingBusy(true)
    try {
      await api.post('/tutors/me/busy', busyForm)
      setShowBusyForm(false)
      setBusyForm({ date: '', start_time: '09:00', end_time: '10:00', reason: '' })
      const r = await api.get(`/tutors/${tutorId}/calendar?month=${month}`)
      setCalData(r.data.data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed')
    } finally {
      setSavingBusy(false)
    }
  }

  const handleRemoveBusy = async (id) => {
    if (!(await confirmDialog('Remove this busy slot?'))) return
    try {
      await api.delete(`/tutors/me/busy/${id}`)
      const r = await api.get(`/tutors/${tutorId}/calendar?month=${month}`)
      setCalData(r.data.data)
    } catch {}
  }

  const getCellClass = (date, hour) => {
    if (isPast(date) || isPastHour(date, hour)) return 'past'
    const dateKey = fmt(date)
    const mins    = hour * 60
    // Use pre-converted eventMap (all times in viewerTz)
    const dayEvents = eventMap[dateKey] || []
    const inAvail   = dayEvents.some(e => e.type === 'available' && timeToMinutes(e.start) <= mins && timeToMinutes(e.end) > mins)
    const inBusy    = dayEvents.some(e => e.type === 'busy'      && timeToMinutes(e.start) <= mins && timeToMinutes(e.end) > mins)
    const inBooked  = dayEvents.some(e => e.type === 'session'   && timeToMinutes(e.start) <= mins && timeToMinutes(e.end) > mins)
    if (inBooked || inBusy) return 'taken'
    if (inAvail) return 'free'
    return 'off'
  }

  const days = view === 'week' ? weekDates : [selectedDay]

  return (
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text)' }}>{monthStr}</span>
          {studentName && <span style={{ fontSize: 12, color: 'var(--text3)' }}>— {studentName}</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
            <Globe size={10} style={{ color: 'var(--accent)' }} />
            {tzShort(viewerTz)}
          </span>
          {tzsDiffer && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              (tutor: {tzShort(tutorTz)})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {mode === 'manage' && (
            <button
              style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}
              onClick={() => setShowBusyForm(true)}
            >
              + Mark Busy
            </button>
          )}
          <button onClick={goToday} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>Today</button>
          <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 4, overflow: 'hidden' }}>
            <button
              onClick={() => setView('week')}
              style={{ padding: '6px 14px', background: view === 'week' ? 'var(--accent)' : 'var(--bg3)', color: view === 'week' ? '#000' : 'var(--text2)', border: 'none', cursor: 'pointer', fontSize: 12 }}
            >Week</button>
            <button
              onClick={() => setView('day')}
              style={{ padding: '6px 14px', background: view === 'day' ? 'var(--accent)' : 'var(--bg3)', color: view === 'day' ? '#000' : 'var(--text2)', border: 'none', cursor: 'pointer', fontSize: 12 }}
            >Day</button>
          </div>
          <button
            onClick={prevWeek}
            disabled={mode === 'book' && addDays(weekStart, -7) < currentMonday}
            style={{ width: 32, height: 32, borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: mode === 'book' && addDays(weekStart, -7) < currentMonday ? 'not-allowed' : 'pointer', fontSize: 16, opacity: mode === 'book' && addDays(weekStart, -7) < currentMonday ? 0.3 : 1 }}
          >‹</button>
          <button onClick={nextWeek} style={{ width: 32, height: 32, borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 16 }}>›</button>
        </div>
      </div>

      {/* ── Past-week banner ── */}
      {mode === 'manage' && isViewingPast && (
        <div style={{ marginBottom: 10, padding: '7px 14px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fcd34d', fontSize: 12, color: '#92400e' }}>
          Viewing past week — read only. Navigate forward to mark slots as busy.
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#dcfce7', border: '1px solid #86efac', display: 'inline-block' }} />
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>Available</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#dbeafe', border: '1px solid #93c5fd', display: 'inline-block' }} />
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>Confirmed session</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fef9c3', border: '1px solid #fcd34d', display: 'inline-block' }} />
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>Pending session</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#f3f4f6', border: '1px solid #9ca3af', display: 'inline-block' }} />
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>Completed session</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fee2e2', border: '1px solid #fca5a5', display: 'inline-block' }} />
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>Busy</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'inline-block' }} />
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>Unavailable</span>
        </div>
        {mode === 'book'   && <span style={{ color: 'var(--text3)', fontSize: 11 }}>Click a green slot to book a session</span>}
        {mode === 'manage' && <span style={{ color: 'var(--text3)', fontSize: 11 }}>Click any future cell to mark busy · Click a red slot to remove it</span>}
      </div>

      {/* ── Calendar grid ── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, borderBottom: '1px solid var(--border)' }}>
          <div style={{ borderRight: '1px solid var(--border)' }} />
          {days.map((date, i) => (
            <div
              key={i}
              onClick={() => { setSelectedDay(date); setView('day') }}
              style={{
                padding: '10px 8px',
                textAlign: 'center',
                borderRight: i < days.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                background: isToday(date) ? 'var(--primary-light)' : 'transparent',
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                {DAYS[i % 7]}
              </div>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: isToday(date) ? 'var(--accent)' : 'transparent',
                color: isToday(date) ? '#000' : isPast(date) ? 'var(--text3)' : 'var(--text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto',
                fontWeight: isToday(date) ? 700 : 400,
                fontSize: 14,
              }}>
                {date.getDate()}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </div>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div style={{ position: 'relative', overflowY: 'auto', maxHeight: '70vh' }} ref={gridRef}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', zIndex: 10 }}>
              <span className="spinner" />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
            {/* Time labels column */}
            <div>
              {HOURS.map(h => (
                <div key={h} style={{ height: 60, borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '4px 8px 0 0' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {h === 12 ? '12pm' : h > 12 ? `${h-12}pm` : `${h}am`}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((date, di) => {
              const dateKey = fmt(date)
              const events  = eventMap[dateKey] || []

              return (
                <div key={di} style={{ position: 'relative', borderRight: di < days.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Hour cells */}
                  {HOURS.map(h => {
                    const cellClass  = getCellClass(date, h)
                    const canBook    = mode === 'book'   && cellClass === 'free'
                    const canMarkBusy = mode === 'manage' && cellClass !== 'past' && !isPastHour(date, h)
                    const isClickable = canBook || canMarkBusy
                    return (
                      <div
                        key={h}
                        onClick={() => isClickable && handleSlotClick(date, h)}
                        style={{
                          height: 60,
                          borderBottom: '1px solid var(--border)',
                          background:
                            cellClass === 'free'  ? '#f0fdf4' :
                            cellClass === 'taken' ? '#fef2f2' :
                            cellClass === 'past'  ? 'var(--bg3)' :
                            'transparent',
                          cursor: isClickable ? 'pointer' : 'default',
                          transition: 'background 0.1s',
                          position: 'relative',
                        }}
                        onMouseEnter={e => {
                          if (canBook)     e.currentTarget.style.background = 'rgba(29,158,117,0.2)'
                          if (canMarkBusy) e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                        }}
                        onMouseLeave={e => {
                          if (canBook)     e.currentTarget.style.background = 'rgba(29,158,117,0.06)'
                          if (canMarkBusy) {
                            e.currentTarget.style.background =
                              cellClass === 'free'  ? '#f0fdf4' :
                              cellClass === 'taken' ? '#fef2f2' :
                              'transparent'
                          }
                        }}
                      />
                    )
                  })}

                  {/* Events overlay */}
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {events.map((ev, ei) => {
                      const startMins = timeToMinutes(ev.start) - 8 * 60
                      const endMins   = timeToMinutes(ev.end)   - 8 * 60
                      const totalMins = 12 * 60
                      const top    = `${(startMins / totalMins) * 100}%`
                      const height = `${Math.max(((endMins - startMins) / totalMins) * 100, 2)}%`

                      return (
                        <div
                          key={ei}
                          style={{
                            position:    'absolute',
                            left:        3,
                            right:       3,
                            top,
                            height,
                            background:  ev.bg,
                            border:      `1px solid ${ev.border}`,
                            borderLeft:  `3px solid ${ev.border}`,
                            borderRadius: 3,
                            padding:     '3px 6px',
                            overflow:    'hidden',
                            pointerEvents: ev.type === 'busy' && mode === 'manage' && !isSlotPast(date, ev.start) ? 'auto' : 'none',
                            cursor:      ev.type === 'busy' && mode === 'manage' && !isSlotPast(date, ev.start) ? 'pointer' : 'default',
                            zIndex:      ev.type === 'session' ? 3 : ev.type === 'busy' ? 2 : 1,
                          }}
                          onClick={() => {
                            if (ev.type === 'busy' && mode === 'manage' && ev.id && !isSlotPast(date, ev.start)) {
                              handleRemoveBusy(ev.id)
                            }
                          }}
                          title={ev.type === 'busy' && mode === 'manage' && !isSlotPast(date, ev.start) ? 'Click to remove' : ''}
                        >
                          <div style={{ fontSize: 11, fontWeight: 600, color: ev.text, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 3 }}>
                            {ev.completed && <span style={{ fontSize: 9, background: '#9ca3af', color: '#fff', borderRadius: 3, padding: '1px 4px', flexShrink: 0, fontWeight: 700 }}>DONE</span>}
                            {ev.label}
                          </div>
                          {ev.sublabel && (
                            <div style={{ fontSize: 10, color: ev.text, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ev.sublabel}
                            </div>
                          )}
                          {ev.sublabel2 && (
                            <div style={{ fontSize: 10, color: ev.text, opacity: 0.65, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: 'italic' }}>
                              {ev.sublabel2}
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: ev.text, opacity: 0.6 }}>
                            {ev.start} – {ev.end}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Current time indicator line ── */}
      {/* Rendered via CSS-in-JS inside the grid — skip for now, complex overlay */}

      {/* ── Book session modal ── */}
      {bookingSlot && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 24 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6, padding: 24, width: '100%', maxWidth: 440 }}>
            {bookSuccess ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}><CheckCircle size={36} color="var(--success)" strokeWidth={1.5} /></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--success)' }}>Session requested!</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>Your tutor will confirm shortly.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>Book Session</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{bookingSlot.date} · {bookingSlot.start} – {bookingSlot.end}</div>
                  </div>
                  <button onClick={() => setBookingSlot(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', display:'flex' }}><X size={16} /></button>
                </div>
                {bookErr && <div className="alert alert-error">{bookErr}</div>}
                <form onSubmit={handleBook}>
                  <div className="form-group">
                    <label className="form-label">What do you want to cover?</label>
                    <input className="form-input" placeholder="e.g. Resume review, mock interview" value={bookForm.subject} onChange={e => setBookForm(p => ({ ...p, subject: e.target.value }))} required autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes (optional)</label>
                    <textarea className="form-input" rows={3} placeholder="Anything specific for this session?" value={bookForm.notes} onChange={e => setBookForm(p => ({ ...p, notes: e.target.value }))} style={{ resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setBookingSlot(null)} style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                    <button type="submit" disabled={!bookForm.subject || bookLoading} style={{ padding: '8px 20px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#000', cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: (!bookForm.subject || bookLoading) ? 0.5 : 1 }}>
                      {bookLoading ? 'Sending…' : 'Send Request'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Mark busy modal ── */}
      {showBusyForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 24 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6, padding: 24, width: '100%', maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)' }}>Mark Busy</div>
              <button onClick={() => setShowBusyForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', display:'flex' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleMarkBusy}>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" min={new Date().toISOString().split('T')[0]} value={busyForm.date} onChange={e => setBusyForm(p => ({ ...p, date: e.target.value }))} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">From</label>
                  <input className="form-input" type="time" value={busyForm.start_time} onChange={e => setBusyForm(p => ({ ...p, start_time: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">To</label>
                  <input className="form-input" type="time" value={busyForm.end_time} onChange={e => setBusyForm(p => ({ ...p, end_time: e.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Reason (optional)</label>
                <input className="form-input" placeholder="e.g. Doctor appointment" value={busyForm.reason} onChange={e => setBusyForm(p => ({ ...p, reason: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowBusyForm(false)} style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={savingBusy} style={{ padding: '8px 20px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#000', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  {savingBusy ? 'Saving…' : 'Mark Busy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}