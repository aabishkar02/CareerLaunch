import { toast } from '../../services/toast'
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import { browserTz, tzShort, availabilityForDay, studentSlotToTutorTime, localToUTC, utcToHHMM } from '../../utils/timezone'
import TimezoneSelector from '../../components/TimezoneSelector'
import useEscape from '../../utils/useEscape'
import usePageTitle from '../../utils/usePageTitle'
import useTabParam from '../../utils/useTabParam'
import ChangePasswordCard from '../../components/ChangePasswordCard'
import HelpChatWidget from '../../components/HelpChatWidget'
import { getSocket } from '../../services/socket'
import {
  Layers, Calendar, Bell, LifeBuoy, Settings as SettingsIcon,
  LogOut, Plus, ArrowLeft, Check, Star, Clock, Video,
  ExternalLink, Send, ChevronRight, X, Zap, Shield,
  Folder, User, BookOpen, MessageSquare, CreditCard, Receipt,
  Download, BadgeCheck, Globe, Award
} from 'lucide-react'
import { SkeletonCard, SkeletonLine, SkeletonText } from '../../components/Skeleton'

// ── Tints ──────────────────────────────────────────────────────
const TINTS = {
  indigo: { bg: '#ecebfd', fg: 'var(--accent)' },
  violet: { bg: '#efeaff', fg: '#7c5cff' },
  blue:   { bg: '#e7effe', fg: '#2563eb' },
  teal:   { bg: '#e1f5f1', fg: '#0f9b8e' },
  amber:  { bg: '#fbf0db', fg: '#d98a1f' },
}
const TINT_KEYS = ['indigo', 'violet', 'indigo', 'blue', 'teal', 'violet', 'amber', 'blue']
const tintOf  = (i = 0) => TINT_KEYS[i % TINT_KEYS.length]
const monoOf  = (n = '') => (n.match(/\b[A-Z]/g) || []).join('').slice(0, 2).toUpperCase() || n.slice(0, 2).toUpperCase()

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(iso, opts) {
  if (!iso) return ''
  return new Date(iso + (String(iso).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric' })
}
function to12(t = '') {
  if (!t) return ''
  let [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}
// Session statuses in DB: pending, confirmed, cancelled, completed
// "upcoming" = pending OR confirmed
const isUpcoming  = s => s.status === 'pending' || s.status === 'confirmed' || s.status === 'scheduled' || s.status === 'upcoming'
const isCompleted = s => s.status === 'completed'

// Calendar helpers
function toMins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function minToTime(m) { return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}` }
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// ── Shared atoms ───────────────────────────────────────────────
function Avatar({ initials, tint = 'indigo', size = 40 }) {
  const c = TINTS[tint] || TINTS.indigo
  return <div style={{ width: size, height: size, borderRadius: '50%', background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: size * .4, flexShrink: 0, letterSpacing: '-0.02em' }}>{initials}</div>
}

function ModTile({ mono, tint = 'indigo', size = 48 }) {
  const c = TINTS[tint] || TINTS.indigo
  return <div style={{ width: size, height: size, borderRadius: size * .3, background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * .36, flexShrink: 0, letterSpacing: '-0.03em' }}>{mono}</div>
}

function CreditRing({ value, total, size = 52 }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r, pct = total ? Math.min(value / total, 1) : 0
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--credit-line)" strokeWidth="4" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--credit)" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * .32, color: 'var(--credit)' }}>{value}</div>
    </div>
  )
}

function StarRating({ value = 5, size = 13 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1.5 }}>
      {[0,1,2,3,4].map(i => (
        <Star key={i} size={size} fill={i < Math.round(value) ? 'var(--credit)' : 'none'} strokeWidth={1.6} style={{ color: i < Math.round(value) ? 'var(--credit)' : 'var(--border)' }} />
      ))}
    </span>
  )
}

function EmptyState({ text }) {
  return <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 14, borderStyle: 'dashed' }}>{text}</div>
}

// ── RateTutorModal ─────────────────────────────────────────────
function RateTutorModal({ session, onClose, onRated }) {
  const [rating,  setRating]  = useState(0)
  const [hover,   setHover]   = useState(0)
  const [text,    setText]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)

  useEffect(() => { if (session) { setRating(0); setHover(0); setText(''); setDone(false) } }, [session])
  useEscape(onClose, !!session)

  if (!session) return null
  const tutorId   = session.tutor_id || session.tutor?.id
  const tutorName = session.tutor_name || `${session.tutor_first_name || ''} ${session.tutor_last_name || ''}`.trim() || 'your mentor'

  const submit = async () => {
    if (!rating || !tutorId) return
    setSaving(true)
    try {
      await api.post(`/onboarding/tutors/${tutorId}/review`, { rating, review_text: text || undefined, session_id: session.id })
      setDone(true)
      onRated?.(session.id)
    } catch (e) {
      if (e.response?.data?.error === 'already_rated') { setDone(true); onRated?.(session.id) }
      else toast.error(e.response?.data?.message || e.response?.data?.error || 'Failed to submit rating')
    }
    finally { setSaving(false) }
  }

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(24,23,31,.42)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label="Rate your session" onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 22, boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-display)' }}>Rate your session</div>
          <button onClick={onClose} aria-label="Close" style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', borderRadius: 8 }}><X size={18} /></button>
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
                  aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n}
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

// ── TutorProfileModal ──────────────────────────────────────────
function TutorProfileModal({ tutorId, tutorName, onClose }) {
  const [tutor,   setTutor]   = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tutorId) return
    setTutor(null)
    setLoading(true)
    api.get(`/onboarding/tutors/${tutorId}`)
      .then(r => setTutor(r.data.data?.tutor || null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tutorId])

  useEscape(onClose, !!tutorId)
  if (!tutorId) return null
  const init = tutor ? `${tutor.first_name?.[0] || ''}${tutor.last_name?.[0] || ''}` : (tutorName || '?').slice(0, 2).toUpperCase()

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(24,23,31,.42)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label="Mentor profile" onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 22, boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-display)' }}>Mentor profile</div>
          <button onClick={onClose} aria-label="Close" style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', borderRadius: 8 }}><X size={18} /></button>
        </div>
        {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>}
        {!loading && tutor && (
          <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
              <Avatar initials={init} tint="violet" size={64} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 20, fontFamily: 'var(--font-display)' }}>{tutor.first_name} {tutor.last_name}{tutor.username && <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>@{tutor.username}</span>}</div>
                {tutor.tutor_profile?.experience_years > 0 && <div style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: 2 }}>{tutor.tutor_profile.experience_years} yrs experience</div>}
                {(tutor.avg_rating > 0 || tutor.tutor_profile?.rating > 0) && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StarRating value={tutor.avg_rating || tutor.tutor_profile?.rating} size={14} />
                    <span style={{ color: 'var(--text3)', fontSize: 13 }}>{Number(tutor.avg_rating || tutor.tutor_profile?.rating).toFixed(1)} · {tutor.review_count || tutor.tutor_profile?.review_count || 0} reviews</span>
                  </div>
                )}
              </div>
            </div>
            {(tutor.bio || tutor.tutor_profile?.bio) && <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 16px' }}>{tutor.bio || tutor.tutor_profile.bio}</p>}
            {((tutor.tutor_profile?.specialisations) || []).length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {tutor.tutor_profile.specialisations.map((s, i) => <span key={i} className="chip chip-line">{s}</span>)}
              </div>
            )}
            {(tutor.reviews_received || []).length > 0 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, marginTop: 4 }}>Recent reviews</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tutor.reviews_received.slice(0, 3).map((rv, i) => (
                    <div key={i} style={{ padding: 14, borderRadius: 12, background: 'var(--bg2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <StarRating value={rv.rating} size={12} />
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>{fmtDate(rv.created_at)}</span>
                      </div>
                      {rv.review_text && <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>{rv.review_text}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {!loading && !tutor && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)' }}>Could not load mentor profile.</div>
        )}
      </div>
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────
function Modal({ open, onClose, children, width = 580 }) {
  useEffect(() => {
    if (!open) return
    const fn = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', fn)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', fn); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(24,23,31,.42)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 22, boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', padding: 28 }}>
        {children}
      </div>
    </div>
  )
}

// ── ScheduleModal (4-step: Mentor → Time → Prep → Confirm) ─────
function ScheduleModal({ enrollment, onClose, onBooked }) {
  const { user }        = useAuth()
  const assignedTutorId = enrollment?.tutor?.id || null

  // Tutors list: always show all available, populated via API on mount
  const [tutors,     setTutors]     = useState(() => {
    const list = []
    if (enrollment?.tutor) list.push(enrollment.tutor)
    ;(enrollment?.available_tutors || []).forEach(t => {
      if (!list.some(x => x.id === t.id)) list.push(t)
    })
    return list
  })
  const [tutorsLoading, setTutorsLoading] = useState(false)

  const [step,         setStep]         = useState(0)   // always start at Mentor
  const [tutorId,      setTutorId]      = useState(assignedTutorId)
  const [calData,      setCalData]      = useState(null)
  const [calLoading,   setCalLoading]   = useState(false)
  const [selectedDay,  setSelectedDay]  = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [form,         setForm]         = useState({ subject: '', notes: '' })
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState('')

  // Fetch tutors from API on mount to get fresh + complete list
  useEffect(() => {
    if (!enrollment?.id) return
    setTutorsLoading(true)
    api.get(`/enrollments/${enrollment.id}/tutors`)
      .then(r => {
        const apiTutors = r.data.data?.tutors || []
        if (apiTutors.length > 0) {
          // Merge: keep assigned tutor first, append any others not already in list
          const merged = []
          if (enrollment?.tutor) merged.push(enrollment.tutor)
          apiTutors.forEach(t => { if (!merged.some(x => x.id === t.id)) merged.push(t) })
          setTutors(merged)
        }
      })
      .catch(() => {}) // fall back to whatever was seeded from enrollment
      .finally(() => setTutorsLoading(false))
  }, [enrollment?.id])

  // Load calendar whenever tutorId changes AND we're on step 1
  useEffect(() => {
    if (step !== 1 || !tutorId) return
    const month = new Date().toISOString().slice(0, 7)
    setCalLoading(true)
    setCalData(null)
    api.get(`/tutors/${tutorId}/calendar?month=${month}`)
      .then(r => setCalData(r.data.data))
      .catch(() => setCalData(null))
      .finally(() => setCalLoading(false))
  }, [step, tutorId])

  // 14 bookable days starting today
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d
  })

  const studentTz = user?.timezone || browserTz()
  const tutorTz   = calData?.tutor_timezone || studentTz

  const getSlots = (dateStr) => {
    if (!calData || !dateStr) return []
    const SESSION_MINS = 90

    // Convert busy/sessions from tutorTz to studentTz
    const convertedBusy = (calData.busy_slots || []).map(b => {
      const ds = String(b.date).slice(0, 10)
      if (tutorTz === studentTz) return b
      const sUTC = localToUTC(ds, b.start_time, tutorTz)
      const eUTC = localToUTC(ds, b.end_time,   tutorTz)
      return { ...b, start_time: utcToHHMM(sUTC, studentTz), end_time: utcToHHMM(eUTC, studentTz) }
    })
    const convertedSessions = (calData.sessions || []).map(s => {
      const ds = String(s.scheduled_date).slice(0, 10)
      if (tutorTz === studentTz) return s
      const sUTC = localToUTC(ds, s.start_time, tutorTz)
      const eUTC = localToUTC(ds, s.end_time,   tutorTz)
      const newDate = new Intl.DateTimeFormat('en-CA', { timeZone: studentTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sUTC))
      return { ...s, scheduled_date: newDate, start_time: utcToHHMM(sUTC, studentTz), end_time: utcToHHMM(eUTC, studentTz) }
    })

    // Timezone-aware availability windows for this student date
    const availWindows = (calData.availability || []).length
      ? availabilityForDay(dateStr, studentTz, tutorTz, calData.availability)
      : []

    const slots = []
    availWindows.forEach(w => {
      let start = toMins(w.start)
      const end = toMins(w.end)
      while (start + SESSION_MINS <= end) {
        const startStr = minToTime(start), endStr = minToTime(start + SESSION_MINS)
        const isBooked = convertedSessions.some(s => String(s.scheduled_date).slice(0,10) === dateStr && toMins(s.start_time) < start + SESSION_MINS && toMins(s.end_time) > start)
        const isBusy   = convertedBusy.some(b => String(b.date).slice(0,10) === dateStr && toMins(b.start_time) < start + SESSION_MINS && toMins(b.end_time) > start)
        const isPast   = new Date(`${dateStr}T${startStr}:00`) <= new Date()
        if (!isBooked && !isBusy && !isPast) slots.push({ start: startStr, end: endStr })
        start += SESSION_MINS
      }
    })
    return slots
  }

  const handleSelectTutor = (id) => {
    setTutorId(id)
    // Clear any previously selected time so the user re-picks for this tutor
    setSelectedDay(null)
    setSelectedTime(null)
    setCalData(null)
  }

  const tutor   = tutors.find(t => t.id === tutorId)
  const slots   = selectedDay ? getSlots(selectedDay) : []
  const STEPS   = ['Mentor', 'Time', 'Prep', 'Confirm']
  const canNext = step === 0 ? !!tutorId
                : step === 1 ? !!(selectedDay && selectedTime)
                : step === 2 ? !!form.subject.trim()
                : false

  const handleSubmit = async () => {
    setSubmitting(true); setError('')
    try {
      const apiSlot = studentSlotToTutorTime(selectedDay, selectedTime.start, selectedTime.end, studentTz, tutorTz)
      await api.post('/sessions/request', {
        tutor_id:       tutorId,
        module_id:      enrollment.module_id,
        enrollment_id:  enrollment.id,
        scheduled_date: apiSlot.scheduled_date,
        start_time:     apiSlot.start_time,
        end_time:       apiSlot.end_time,
        subject:        form.subject,
        notes:          form.notes || undefined,
      })
      onBooked?.()
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to book session. Please try again.')
    } finally { setSubmitting(false) }
  }

  const tutorRating = (t) => t.average_rating || t.tutor_profile?.rating || null

  return (
    <Modal open width={600} onClose={onClose}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>Book a session</div>
          <div style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: 2 }}>{enrollment?.module?.name || enrollment?.module?.title} · 1 credit · 90 min</div>
        </div>
        <button onClick={onClose} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', borderRadius: 8 }}>
          <X size={18} />
        </button>
      </div>

      {/* Step bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 999, background: i <= step ? 'var(--accent)' : 'var(--border)', transition: 'background .3s' }} />
            <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 6, color: i === step ? 'var(--accent)' : 'var(--text3)' }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ minHeight: 220 }}>

        {/* ── Step 0: Mentor ── */}
        {step === 0 && (
          <div>
            {tutorsLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 20, marginBottom: 8 }}>
                <span className="spinner" style={{ width: 20, height: 20 }} />
              </div>
            )}
            {!tutorsLoading && tutors.length === 0 && (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
                No mentors are assigned to this module yet. Contact admin to get one assigned.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tutors.map(t => {
                const init    = `${t.first_name?.[0]||''}${t.last_name?.[0]||''}`
                const sel     = tutorId === t.id
                const rating  = tutorRating(t)
                const isAssigned = t.id === assignedTutorId
                return (
                  <button key={t.id} onClick={() => handleSelectTutor(t.id)} style={{
                    padding: 16, display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left',
                    border: sel ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 14, background: sel ? 'var(--accent-light)' : '#fff',
                    boxShadow: sel ? '0 4px 14px -6px rgba(79,70,229,.3)' : '0 1px 3px rgba(0,0,0,.06)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', width: '100%',
                  }}>
                    <Avatar initials={init} tint="violet" size={46} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{t.first_name} {t.last_name}</span>
                        {isAssigned && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                            Your mentor
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>
                        {t.tutor_profile?.experience_years ? `${t.tutor_profile.experience_years} yrs exp · ` : ''}Mentor
                      </div>
                      {t.email && <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 1 }}>{t.email}</div>}
                      {rating && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                          <StarRating value={rating} size={12} />
                          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{Number(rating).toFixed(1)}</span>
                          {t.tutor_profile?.review_count > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text3)' }}>({t.tutor_profile.review_count})</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', border: sel ? 'none' : '2px solid var(--border)', background: sel ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0, transition: 'all .15s' }}>
                      {sel && <Check size={14} style={{ color: '#fff' }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Step 1: Time ── */}
        {step === 1 && (
          calLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <Avatar initials={`${tutor?.first_name?.[0]||''}${tutor?.last_name?.[0]||''}`} tint="violet" size={34} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{tutor?.first_name} {tutor?.last_name}'s availability</span>
                <span style={{ color: 'var(--text3)', fontSize: 13, marginLeft: 'auto' }}>Pick a slot below</span>
              </div>

              {/* Day picker */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
                {days.map((d, i) => {
                  const ds      = isoDate(d)
                  const hasSl   = calData ? getSlots(ds).length > 0 : false
                  const sel     = selectedDay === ds
                  return (
                    <button key={i} disabled={!hasSl}
                      onClick={() => { setSelectedDay(ds); setSelectedTime(null) }}
                      style={{ flexShrink: 0, width: 62, padding: '10px 0', borderRadius: 12, textAlign: 'center',
                        cursor: hasSl ? 'pointer' : 'default', opacity: hasSl ? 1 : 0.35,
                        border: sel ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                        background: sel ? 'var(--accent-light)' : hasSl ? '#fff' : 'var(--bg2)',
                        fontFamily: 'inherit', transition: 'all .15s',
                      }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: sel ? 'var(--accent)' : 'var(--text3)', letterSpacing: '.06em' }}>
                        {d.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: sel ? 'var(--accent)' : 'var(--text)', marginTop: 2 }}>
                        {d.getDate()}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Time slots */}
              {!calData ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', background: '#fffbeb', borderRadius: 12, fontSize: 13.5, color: '#92400e', border: '1px solid #fcd34d' }}>
                  This mentor hasn't set their availability yet. Try another mentor or contact support.
                </div>
              ) : !selectedDay ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 14, background: 'var(--bg2)', borderRadius: 12 }}>
                  Select a day above to see available times.
                </div>
              ) : slots.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', background: 'var(--bg2)', borderRadius: 12, color: 'var(--text3)', fontSize: 14 }}>
                  No available slots on this day — try a different date.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {slots.map(slot => {
                    const sel = selectedTime?.start === slot.start
                    return (
                      <button key={slot.start} onClick={() => setSelectedTime(slot)} style={{
                        padding: '13px 0', borderRadius: 11, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                        border: sel ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                        background: sel ? 'var(--accent)' : '#fff',
                        color: sel ? '#fff' : 'var(--text)',
                        transition: 'all .15s',
                      }}>
                        {to12(slot.start)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        )}

        {/* ── Step 2: Prep ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700 }}>
              Pre-session questionnaire
            </div>
            <div className="field">
              <label>What do you want to cover? *</label>
              <input className="input" placeholder="e.g. Resume review, mock interview, LinkedIn profile…"
                value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} autoFocus />
            </div>
            <div className="field">
              <label>Anything to prepare? (optional)</label>
              <textarea className="form-input" rows={3} placeholder="Share context so your mentor can prepare for the session…"
                value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ resize: 'vertical' }} />
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 3 && (
          <div>
            {error && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13.5, color: '#b91c1c', marginBottom: 16 }}>
                {error}
              </div>
            )}
            <div className="card" style={{ padding: 20, background: 'var(--bg2)' }}>
              {[
                ['Mentor',   `${tutor?.first_name} ${tutor?.last_name}`],
                ['When',     `${new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${to12(selectedTime?.start)}`],
                ['Duration', '90 minutes'],
                ['Module',   enrollment?.module?.name || enrollment?.module?.title || 'Module'],
                ['Topic',    form.subject],
              ].map(([k, v], i, arr) => (
                <div key={k} style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--text3)', fontSize: 13, width: 76, fontWeight: 600, flexShrink: 0, paddingTop: 1 }}>{k}</span>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '14px 16px', background: 'var(--credit-bg)', border: '1px solid var(--credit-line)', borderRadius: 12 }}>
              <Star size={18} fill="var(--credit)" strokeWidth={0} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, color: '#7a5310', fontWeight: 600 }}>
                1 credit will be held when you book — you'll have {Math.max(0, (enrollment?.credits_remaining || 0) - 1)} left. If the session is cancelled, the credit returns to your balance.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost" onClick={() => step === 0 ? onClose() : setStep(step - 1)}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < 3 ? (
          <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Continue <ChevronRight size={16} />
          </button>
        ) : (
          <button className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? <><span className="spinner" /> Booking…</> : <><Check size={17} strokeWidth={2.4} /> Confirm booking</>}
          </button>
        )}
      </div>
    </Modal>
  )
}

// ── Logo ────────────────────────────────────────────────────────
function Logo({ onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
        <path d="M16 1.5 19.4 12.6 30.5 16 19.4 19.4 16 30.5 12.6 19.4 1.5 16 12.6 12.6Z" fill="var(--accent)"/>
        <path d="M16 8.5 17.7 14.3 23.5 16 17.7 17.7 16 23.5 14.3 17.7 8.5 16 14.3 14.3Z" fill="white" opacity=".82"/>
      </svg>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.03em', color: 'var(--text)' }}>
        Career<span style={{ color: 'var(--accent)' }}>Launch</span>
      </span>
    </div>
  )
}

// ── Dashboard Shell ─────────────────────────────────────────────
const UnreadContext = createContext(() => {})

function DashShell({ children, title, subtitle, headRight, enrollments = [] }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`
  const totalCredits = enrollments.reduce((s, e) => s + (e.credits_remaining ?? 0), 0)

  useEffect(() => {
    api.get('/notifications/me').then(r => setUnread(r.data.data?.unread_count || 0)).catch(() => {})
  }, [])

  const nav = [
    { label: 'Modules',        icon: Layers,         path: '/dashboard',                  exact: true  },
    { label: 'Meetings',       icon: Calendar,       path: '/dashboard/meetings',         exact: false },
    { label: 'Messages',       icon: MessageSquare,  path: '/dashboard/chat',             exact: false },
    { label: 'Certifications', icon: Award,          path: '/dashboard/certifications',   exact: false },
    { label: 'Billing',        icon: CreditCard,     path: '/dashboard/billing',          exact: false },
    { label: 'Notifications',  icon: Bell,           path: '/dashboard/notifications',    exact: false, badge: unread },
    { label: 'Support',        icon: LifeBuoy,       path: '/dashboard/support',          exact: false },
    { label: 'Settings',       icon: SettingsIcon,   path: '/dashboard/settings',         exact: false },
  ]

  const handleLogout = async () => { await logout(); navigate('/') }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{ width: 246, flexShrink: 0, background: '#fff', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '20px 20px 16px' }}>
          <Logo onClick={() => navigate('/')} />
        </div>
        <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {nav.map(n => {
            const on = n.exact ? location.pathname === '/dashboard' : location.pathname.startsWith(n.path)
            return (
              <button key={n.path} onClick={() => navigate(n.path)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, textAlign: 'left', background: on ? 'var(--accent-light)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text2)', fontWeight: on ? 700 : 600, fontSize: 14.5, position: 'relative', transition: 'background .15s', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--bg2)' }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                <n.icon size={19} strokeWidth={on ? 2 : 1.8} />
                <span style={{ flex: 1 }}>{n.label}</span>
                {n.badge > 0 && <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--danger)', color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{n.badge}</span>}
              </button>
            )
          })}
        </div>
        {/* Credit balance + user */}
        <div style={{ marginTop: 'auto', padding: 14 }}>
          <div style={{ borderRadius: 16, padding: 16, border: '1px solid var(--credit-line)', background: 'linear-gradient(150deg,#fbf2dd,#fdf8ef)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--credit)', fontWeight: 700, fontSize: 12.5, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              <Star size={15} fill="var(--credit)" strokeWidth={0} /> Credit balance
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: '#7a5310', letterSpacing: '-0.03em' }}>{totalCredits}</span>
              <span style={{ fontSize: 13, color: '#9a7423', fontWeight: 600 }}>credits</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#9a7423', marginTop: 2 }}>≈ {totalCredits * 90} mins of mentoring</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '8px 6px' }}>
            <Avatar initials={initials || 'ME'} tint="teal" size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.first_name} {user?.last_name}</div>
              {user?.username && <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 600 }}>@{user.username}</div>}
              <div style={{ color: 'var(--text3)', fontSize: 11.5 }}>Student</div>
            </div>
            <button onClick={handleLogout} style={{ padding: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }} title="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(246,245,241,.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '0 32px', height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 22, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>{title}</h1>
              {subtitle && <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 1 }}>{subtitle}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {headRight}
              {totalCredits > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--credit-line)', background: 'var(--credit-bg)', fontWeight: 700, color: 'var(--credit)' }}>
                  <Star size={17} fill="var(--credit)" strokeWidth={0} />
                  <span style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)' }}>{totalCredits}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, opacity: .8 }}>credits</span>
                </span>
              )}
              <button onClick={() => navigate('/dashboard/notifications')} style={{ position: 'relative', width: 42, height: 42, borderRadius: 12, border: '1px solid var(--border)', background: '#fff', display: 'grid', placeItems: 'center', color: 'var(--text2)', cursor: 'pointer' }}>
                <Bell size={19} />
                {unread > 0 && <span style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', boxShadow: '0 0 0 2px #fff' }} />}
              </button>
              <Avatar initials={initials || 'ME'} tint="teal" size={42} />
            </div>
          </div>
        </header>
        <div style={{ padding: '28px 32px 64px', maxWidth: 1120, margin: '0 auto' }}>
          <UnreadContext.Provider value={setUnread}>
            {children}
          </UnreadContext.Provider>
        </div>
      </main>
    </div>
  )
}

// ── Modules overview ────────────────────────────────────────────
function ModulesPage({ enrollments, sessions, loading }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const studentTz = user?.timezone || browserTz()
  const tzTime = (s, t) => {
    const tTz = s.tutor_timezone || studentTz
    if (!t || tTz === studentTz) return t
    return utcToHHMM(localToUTC(String(s.scheduled_date).slice(0, 10), t, tTz), studentTz)
  }
  const upcoming  = sessions.filter(isUpcoming)
  const completed = sessions.filter(isCompleted)

  const stats = [
    { label: 'Credits remaining',  value: enrollments.reduce((s, e) => s + (e.credits_remaining ?? 0), 0), icon: Star,     tint: 'amber',  sub: `across ${enrollments.length} module${enrollments.length !== 1 ? 's' : ''}` },
    { label: 'Upcoming sessions',  value: upcoming.length,   icon: Calendar, tint: 'indigo', sub: upcoming[0]?.scheduled_date ? `next on ${fmtDate(upcoming[0].scheduled_date)}` : 'none booked yet' },
    { label: 'Sessions completed', value: completed.length,  icon: Shield,   tint: 'teal',   sub: 'keep the momentum' },
  ]

  if (loading) return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 26 }}>
        {[0,1,2].map(i => <SkeletonCard key={i} height={88} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0,1,2].map(i => (
          <div key={i} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <SkeletonCard height={48} style={{ width: 48, borderRadius: 13, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <SkeletonLine height={14} width="55%" style={{ marginBottom: 8 }} />
              <SkeletonLine height={11} width="35%" />
            </div>
            <SkeletonLine height={28} width={52} />
          </div>
        ))}
      </div>
    </>
  )

  return (
    <>
      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 26 }} className="stat-strip">
        {stats.map((s, i) => (
          <div key={i} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: TINTS[s.tint].bg, color: TINTS[s.tint].fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <s.icon size={22} fill={s.tint === 'amber' ? TINTS.amber.fg : 'none'} strokeWidth={s.tint === 'amber' ? 0 : 1.8} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 19, fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>Your modules</h2>
      </div>

      {enrollments.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <BookOpen size={40} style={{ margin: '0 auto 16px', color: 'var(--border)' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>No modules yet</div>
          <div style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 24 }}>Purchase a plan to start your 1-on-1 mentoring journey.</div>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Browse plans</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }} className="mymod-grid">
          {enrollments.map((e, i) => {
            const tint     = e.tint || tintOf(i)
            const mono     = e.mono || monoOf(e.module?.name || e.module?.title || e.module_name || '')
            const name     = e.module?.name || e.module?.title || e.module_name || 'Module'
            const creds    = e.credits_remaining ?? 0
            const total    = e.credits_granted   ?? e.credits_total ?? creds
            const moduleId = e.module_id || e.module?.id
            const nextS    = sessions.find(s => isUpcoming(s) && (s.module_id === moduleId || s.enrollment_id === e.id))
            return (
              <button key={e.id} onClick={() => navigate(`/dashboard/modules/${e.id}`)} className="card"
                style={{ padding: 20, textAlign: 'left', position: 'relative', transition: 'transform .15s, box-shadow .15s', border: 'none', outline: 'inherit', cursor: 'pointer' }}
                onMouseEnter={ev => { ev.currentTarget.style.transform = 'translateY(-3px)'; ev.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                onMouseLeave={ev => { ev.currentTarget.style.transform = ''; ev.currentTarget.style.boxShadow = '' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <ModTile mono={mono} tint={tint} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{name}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>{(e.module?.short_description || e.module?.description || '').slice(0, 60)}</div>
                  </div>
                  <CreditRing value={creds} total={Math.max(total, creds, 1)} />
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {nextS ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Calendar size={15} /> Next: {fmtDate(nextS.scheduled_date)} · {to12(tzTime(nextS, nextS.start_time))}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text3)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Clock size={15} /> No upcoming session
                    </span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Open <ChevronRight size={15} />
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// ── Module Detail ───────────────────────────────────────────────
function ModuleDetailPage({ enrollments, sessions, onBook }) {
  const { enrollmentId } = useParams()
  const navigate = useNavigate()
  const [tab, setTab]       = useTabParam('meetings')
  const [materials, setMaterials] = useState([])
  const [tutor, setTutor]   = useState(null)
  const [otherTutors, setOtherTutors] = useState([])
  const [rateSession,    setRateSession]    = useState(null)
  const [profileTutorId,  setProfileTutorId]  = useState(null)
  const [profileTutorName, setProfileTutorName] = useState('')
  const [selectingTutor, setSelectingTutor] = useState(null)

  const openProfile = (id, name) => { setProfileTutorId(id); setProfileTutorName(name) }

  const selectTutor = async (tutorId) => {
    setSelectingTutor(tutorId)
    try {
      const res = await api.post(`/students/me/module-enrollments/${enrollmentId}/select-tutor`, { tutor_id: tutorId })
      const selected = otherTutors.find(t => t.id === tutorId)
      if (selected) setTutor(selected)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to select mentor')
    } finally {
      setSelectingTutor(null)
    }
  }

  const enrollment = enrollments.find(e => String(e.id) === enrollmentId)
  const moduleId   = enrollment?.module_id || enrollment?.module?.id
  const myMeetings = sessions.filter(s => s.module_id === moduleId || s.enrollment_id === enrollment?.id)

  const tint   = tintOf(enrollments.findIndex(e => String(e.id) === enrollmentId))
  const mono   = monoOf(enrollment?.module?.name || enrollment?.module?.title || enrollment?.module_name || '')
  const name   = enrollment?.module?.name || enrollment?.module?.title || enrollment?.module_name || 'Module'
  const creds  = enrollment?.credits_remaining ?? 0
  const total  = enrollment?.credits_granted   ?? enrollment?.credits_total ?? Math.max(creds, 1)

  useEffect(() => {
    if (!enrollmentId) return
    // Materials
    api.get(`/enrollments/${enrollmentId}/materials`).then(r => setMaterials(r.data.data?.materials || [])).catch(() => {})
    // Tutor: use the enrolled tutor if available
    if (enrollment?.tutor) {
      setTutor(enrollment.tutor)
    } else {
      api.get(`/enrollments/${enrollmentId}/tutor`).then(r => setTutor(r.data.data?.tutor || null)).catch(() => {})
    }
    // Other tutors
    if (enrollment?.available_tutors?.length) {
      setOtherTutors(enrollment.available_tutors)
    } else {
      api.get(`/enrollments/${enrollmentId}/tutors`).then(r => setOtherTutors(r.data.data?.tutors || [])).catch(() => {})
    }
  }, [enrollmentId, enrollment?.tutor])

  if (!enrollment) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
        Module not found.{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>← Back</button>
      </div>
    )
  }

  const upcoming = myMeetings.filter(isUpcoming)
  const past     = myMeetings.filter(isCompleted)

  return (
    <>
      {/* Module hero */}
      <div className="card" style={{ padding: 24, display: 'flex', gap: 20, alignItems: 'center', marginBottom: 22 }}>
        <ModTile mono={mono} tint={tint} size={64} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 20, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em', marginBottom: 6 }}>{name}</div>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.55, maxWidth: 560, margin: 0 }}>
            {enrollment?.module?.short_description || enrollment?.module?.description || enrollment?.description || ''}
          </p>
        </div>
        <div style={{ textAlign: 'center', padding: '0 8px' }}>
          <CreditRing value={creds} total={Math.max(total, creds, 1)} size={68} />
          <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 8, fontWeight: 600 }}>{creds} of {total} left</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[['meetings', 'Meetings', Calendar], ['materials', 'Materials', Folder], ['tutor', 'My Tutor', User]].map(([k, l, Ic]) => (
          <button key={k} onClick={() => setTab(k)} className={`tab-btn${tab === k ? ' active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ic size={17} />{l}
          </button>
        ))}
      </div>

      {/* Meetings tab */}
      {tab === 'meetings' && (
        <div>
          {/* Book button */}
          <div className="card" style={{ padding: 22, display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24, background: 'linear-gradient(120deg,#f4f3fe,#fff)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Plus size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)' }}>Schedule a 1-on-1 session</div>
              <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>Pick a mentor's open slot and you're booked. Costs 1 credit.</div>
            </div>
            {creds < 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <button className="btn btn-primary" onClick={() => navigate('/plans')}>
                  Buy more credits <ChevronRight size={16} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>You're out of credits for this module</span>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={() => onBook?.(enrollmentId)}>
                Book session <ChevronRight size={16} />
              </button>
            )}
          </div>

          <h3 style={{ fontSize: 16, marginBottom: 12, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Upcoming</h3>
          {upcoming.length === 0
            ? <EmptyState text="No upcoming sessions yet — book your next one above." />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>{upcoming.map(mt => <MeetingRow key={mt.id} mt={mt} />)}</div>}

          <h3 style={{ fontSize: 16, marginBottom: 12, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Past sessions</h3>
          {past.length === 0
            ? <EmptyState text="Your completed sessions will appear here." />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{past.map(mt => (
                <MeetingRow key={mt.id} mt={mt} past
                  onRateTutor={setRateSession}
                  onViewTutor={openProfile}
                />
              ))}</div>}
          <RateTutorModal session={rateSession} onClose={() => setRateSession(null)} onRated={id => { setSessions?.(p => p?.map(s => s.id === id ? { ...s, has_review: true } : s)); setRateSession(null) }} />
          <TutorProfileModal tutorId={profileTutorId} tutorName={profileTutorName} onClose={() => { setProfileTutorId(null); setProfileTutorName('') }} />
        </div>
      )}

      {/* Materials tab */}
      {tab === 'materials' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="mat-grid">
          {materials.map((it, i) => (
            <div key={i} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: it.type === 'video' ? 'var(--accent-light)' : 'var(--bg2)', color: it.type === 'video' ? 'var(--accent)' : 'var(--text2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {it.type === 'video' ? <Video size={22} /> : <Folder size={22} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {it.title}{it.is_new && <span className="chip chip-alert" style={{ padding: '1px 7px', fontSize: 11 }}>New</span>}
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 12.5, textTransform: 'capitalize' }}>{it.type} · {it.duration || it.size || ''}</div>
              </div>
              {it.url && <a href={it.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text3)' }}><ExternalLink size={17} /></a>}
            </div>
          ))}
          {materials.length === 0 && <EmptyState text="Materials your mentor shares will show up here." />}
        </div>
      )}

      {/* Tutor tab */}
      {tab === 'tutor' && (
        <div>
          {tutor ? (
            <>
              <h3 style={{ fontSize: 16, marginBottom: 12, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Your mentor</h3>
              <div className="card" style={{ padding: 22, display: 'flex', gap: 18, alignItems: 'flex-start', marginBottom: 14 }}>
                <Avatar initials={`${tutor.first_name?.[0] || ''}${tutor.last_name?.[0] || ''}`} tint="violet" size={64} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div>
                      <button onClick={() => openProfile(tutor.id, `${tutor.first_name} ${tutor.last_name}`)}
                        style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-display)', cursor: 'pointer', color: 'var(--accent)', textAlign: 'left' }}>
                        {tutor.first_name} {tutor.last_name}
                      </button>
                      {tutor.username && <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>@{tutor.username}</div>}
                    </div>
                    {tutor.average_rating > 0 && <StarRating value={tutor.average_rating} size={13} />}
                  </div>
                  <div style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: 2 }}>{tutor.title || tutor.headline || ''}</div>
                  {tutor.email && <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>{tutor.email}</div>}
                  {tutor.bio && <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.55, marginTop: 10 }}>{tutor.bio}</p>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => onBook?.(enrollmentId)}>
                      <Calendar size={15} /> Book session
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ padding: 22, marginBottom: 14, background: 'linear-gradient(120deg,#f4f3fe,#fff)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <User size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>Choose your mentor</div>
                <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>Select one of the available mentors below to get started.</div>
              </div>
            </div>
          )}

          {otherTutors.filter(t => t.id !== tutor?.id).length > 0 && (
            <>
              <h3 style={{ fontSize: 16, margin: '26px 0 12px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {tutor ? 'Other mentors' : 'Available mentors'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
                {otherTutors.filter(t => t.id !== tutor?.id).map((t, i) => (
                  <div key={t.id} className="card" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <Avatar initials={`${t.first_name?.[0] || ''}${t.last_name?.[0] || ''}`} tint={tintOf(i)} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button onClick={() => openProfile(t.id, `${t.first_name} ${t.last_name}`)}
                        style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, fontSize: 15, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit', textAlign: 'left' }}>
                        {t.first_name} {t.last_name}
                      </button>
                      <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>{t.title || t.headline || ''}</div>
                      {t.email && <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 1 }}>{t.email}</div>}
                      {t.tutor_profile?.experience_years && (
                        <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>{t.tutor_profile.experience_years} yrs experience</div>
                      )}
                      {(t.average_rating > 0 || t.tutor_profile?.rating > 0) && (
                        <div style={{ marginTop: 6 }}><StarRating value={t.average_rating || t.tutor_profile?.rating} size={12} /></div>
                      )}
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ flexShrink: 0, alignSelf: 'center' }}
                      disabled={selectingTutor === t.id}
                      onClick={() => selectTutor(t.id)}>
                      {selectingTutor === t.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Select'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {!tutor && otherTutors.length === 0 && (
            <EmptyState text="No mentors are assigned to this module yet. Contact support if this persists." />
          )}
        </div>
      )}
    </>
  )
}

// ── Meeting row ─────────────────────────────────────────────────
function MeetingRow({ mt, past, onRateTutor, onViewTutor }) {
  const { user } = useAuth()
  const studentTz  = user?.timezone || browserTz()
  const tutorTz    = mt.tutor_timezone || studentTz
  const ds         = String(mt.scheduled_date || mt.date || '').slice(0, 10)
  const sUTC       = (mt.start_time && tutorTz !== studentTz && ds) ? localToUTC(ds, mt.start_time, tutorTz) : null
  const displayTime = sUTC ? utcToHHMM(sUTC, studentTz) : mt.start_time
  const displayDateStr = sUTC
    ? new Intl.DateTimeFormat('en-CA', { timeZone: studentTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sUTC))
    : (mt.scheduled_date || mt.date || '')
  const dateObj   = new Date(displayDateStr + (String(displayDateStr).length === 10 ? 'T00:00:00' : ''))
  const tutorName     = mt.tutor_name || `${mt.tutor_first_name || mt.tutor?.first_name || ''}  ${mt.tutor_last_name || mt.tutor?.last_name || ''}`.trim() || 'Mentor'
  const tutorId       = mt.tutor_id   || mt.tutor?.id
  const tutorEmail    = mt.tutor_email || mt.tutor?.email || ''
  const tutorUsername = mt.tutor_username || mt.tutor?.username || null
  const tInit         = tutorName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'TU'

  const tutorEl = tutorId && onViewTutor ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <button onClick={() => onViewTutor(tutorId, tutorName)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'transparent', fontFamily: 'inherit' }}
        onMouseEnter={e => e.currentTarget.style.textDecorationColor = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.textDecorationColor = 'transparent'}>
        {tutorName}
      </button>
      {tutorUsername && <span style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 600, opacity: 0.8 }}>@{tutorUsername}</span>}
    </span>
  ) : <span>{tutorName}{tutorUsername && <span style={{ marginLeft: 4, fontSize: 11.5, color: 'var(--accent)', fontWeight: 600, opacity: 0.8 }}>@{tutorUsername}</span>}</span>

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ textAlign: 'center', width: 56, flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            {isNaN(dateObj.getDate()) ? '—' : dateObj.getDate()}
          </div>
          <div style={{ color: 'var(--text3)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase' }}>
            {fmtDate(displayDateStr, { month: 'short' })}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
        <Avatar initials={tInit} tint="indigo" size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{mt.subject || mt.topic || 'Session'}</div>
          <div style={{ color: 'var(--text3)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            {tutorEl}{displayTime ? ` · ${to12(displayTime)}` : ''}{mt.module_name ? ` · ${mt.module_name}` : ''}
          </div>
          {tutorEmail && <div style={{ color: 'var(--text3)', fontSize: 12 }}>{tutorEmail}</div>}
        </div>
        {past ? (
          isCompleted(mt) ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="chip chip-good"><Check size={13} /> Completed</span>
              {onRateTutor && tutorId && (
                mt.has_review
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)', padding: '4px 8px', background: 'var(--bg2)', borderRadius: 6, border: '1px solid var(--border)' }}><Star size={12} fill="var(--credit)" style={{ color: 'var(--credit)' }} /> Rated</span>
                  : <button className="btn btn-outline btn-sm" onClick={() => onRateTutor(mt)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Star size={13} /> Rate</button>
              )}
            </div>
          ) : <span className="chip">Done</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="chip chip-good">{mt.status === 'confirmed' ? 'Confirmed' : 'Pending'}</span>
            {mt.meeting_link && <a href={mt.meeting_link} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm"><Video size={16} /> Join</a>}
          </div>
        )}
      </div>
      {mt.tutor_notes && !past && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600, color: 'var(--text3)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>Note from tutor · </span>
          {mt.tutor_notes}
        </div>
      )}
    </div>
  )
}

// ── All Meetings page ───────────────────────────────────────────
function MeetingsPage({ sessions, onRated }) {
  const [filter,        setFilter]        = useState('upcoming')
  const [rateSession,   setRateSession]   = useState(null)
  const [profileTutorId, setProfileTutorId] = useState(null)
  const [profileTutorName, setProfileTutorName] = useState('')

  const upcoming  = sessions.filter(isUpcoming).sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))
  const completed = sessions.filter(isCompleted).sort((a, b) => (b.scheduled_date || '').localeCompare(a.scheduled_date || ''))
  const list = filter === 'upcoming' ? upcoming : completed

  const openProfile = (id, name) => { setProfileTutorId(id); setProfileTutorName(name) }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, background: 'var(--bg2)', padding: 4, borderRadius: 999, width: 'fit-content', marginBottom: 22 }}>
        {[['upcoming', 'Upcoming', upcoming.length], ['completed', 'Completed', completed.length]].map(([k, l, c]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ height: 36, padding: '0 16px', borderRadius: 999, fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, background: filter === k ? '#fff' : 'transparent', color: filter === k ? 'var(--text)' : 'var(--text2)', boxShadow: filter === k ? 'var(--shadow-xs)' : 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            {l}<span style={{ fontSize: 12, padding: '1px 7px', borderRadius: 999, background: filter === k ? 'var(--accent-light)' : 'var(--border)', color: filter === k ? 'var(--accent)' : 'var(--text2)', fontWeight: 700 }}>{c}</span>
          </button>
        ))}
      </div>
      {list.length === 0
        ? <EmptyState text={filter === 'upcoming' ? 'No upcoming sessions — book one from your module page.' : 'No completed sessions yet.'} />
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{list.map(mt => (
            <MeetingRow key={mt.id} mt={mt} past={filter === 'completed'}
              onRateTutor={setRateSession}
              onViewTutor={openProfile}
            />
          ))}</div>}
      <RateTutorModal session={rateSession} onClose={() => setRateSession(null)} onRated={id => { onRated?.(id); setRateSession(null) }} />
      <TutorProfileModal tutorId={profileTutorId} tutorName={profileTutorName} onClose={() => { setProfileTutorId(null); setProfileTutorName('') }} />
    </>
  )
}

// ── Notifications ───────────────────────────────────────────────
function NotificationsPage() {
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)
  const setUnread = useContext(UnreadContext)

  useEffect(() => {
    api.get('/notifications/me').then(r => setNotifs(r.data.data?.notifications || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const markAll = () => {
    api.patch('/notifications/read-all').catch(() => {})
    setNotifs(p => p.map(n => ({ ...n, read: true })))
    setUnread(0)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
  return (
    <>
      {notifs.some(n => !n.read) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" onClick={markAll}><Check size={15} /> Mark all read</button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notifs.map((n, i) => {
          const unread = !n.read
          const tint   = { info: 'indigo', warning: 'amber', alert: 'violet', system: 'teal' }[n.type] || 'indigo'
          const c      = TINTS[tint] || TINTS.indigo
          return (
            <div key={n.id || i} className="card" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start', borderLeft: unread ? '3px solid var(--accent)' : '1px solid var(--border)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Bell size={20} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14.5 }}>{n.title}</span>
                  {unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />}
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5, marginTop: 4 }}>{n.message || n.body || n.content}</p>
                <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={12} /> {n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
            </div>
          )
        })}
        {notifs.length === 0 && <EmptyState text="No notifications yet. You're all caught up!" />}
      </div>
    </>
  )
}

// ── Support ─────────────────────────────────────────────────────
function SupportPage() {
  const [tickets, setTickets]   = useState([])
  const [form, setForm]         = useState({ subject: '', category: 'Scheduling', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [ok, setOk]             = useState(false)

  useEffect(() => {
    api.get('/support/tickets').then(r => setTickets(r.data.data?.tickets || [])).catch(() => {})
  }, [])

  const submit = async () => {
    if (!form.subject || !form.message) return
    setSubmitting(true)
    try {
      await api.post('/support/tickets', { subject: form.subject, category: form.category, message: form.message })
      setOk(true); setTimeout(() => setOk(false), 3000)
      setForm({ subject: '', category: 'Scheduling', message: '' })
      api.get('/support/tickets').then(r => setTickets(r.data.data?.tickets || [])).catch(() => {})
    } catch (e) { console.error(e) } finally { setSubmitting(false) }
  }

  const statusCls = s => ({ Resolved: 'chip-good', Open: 'chip-alert', open: 'chip-alert', resolved: 'chip-good', in_review: 'chip-soft' }[s] || 'chip-soft')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }} className="sup-grid">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Send size={18} style={{ color: 'var(--accent)' }} /> New request
        </div>
        {ok && <div className="alert alert-success" style={{ marginBottom: 14 }}>Request submitted! We'll reply within 24 hours.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field"><label>Subject</label><input className="input" placeholder="Briefly, what's going on?" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} /></div>
          <div className="field"><label>Category</label>
            <select className="select" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
              {['Scheduling', 'Payments & credits', 'Technical', 'Mentor feedback', 'Other'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field"><label>Details</label>
            <textarea className="form-input" rows={4} placeholder="Tell us what happened…" value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-full" disabled={!form.subject || !form.message || submitting} onClick={submit}>
            {submitting ? <><span className="spinner" /> Submitting…</> : <><Send size={16} /> Submit request</>}
          </button>
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14, fontFamily: 'var(--font-display)' }}>Your tickets</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tickets.map(t => (
            <div key={t.id} className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', color: 'var(--text3)', fontSize: 12, fontWeight: 700 }}>{t.ticket_number || t.id?.slice(0, 8).toUpperCase() || ''}</span>
                <span className={`chip ${statusCls(t.status)}`} style={{ marginLeft: 'auto' }}>{t.status}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 8 }}>{t.title || t.subject}</div>
              <div style={{ color: 'var(--text3)', fontSize: 12.5, marginTop: 2 }}>{t.category?.replace(/_/g, ' ')} · {fmtDate(t.created_at, { month: 'short', day: 'numeric' })}</div>
              {t.last_reply && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#fbfaf7', borderRadius: 10, fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 9 }}>
                  <Send size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                  <span><b style={{ color: 'var(--text)' }}>Support:</b> {t.last_reply}</span>
                </div>
              )}
            </div>
          ))}
          {tickets.length === 0 && <EmptyState text="No tickets yet. Submit one above and we'll get back to you." />}
        </div>
      </div>
    </div>
  )
}

// ── Settings ─────────────────────────────────────────────────────
function SettingsPage() {
  const { user, setUser, updateTimezone } = useAuth()
  const [form, setForm]   = useState({ first_name: user?.first_name || '', last_name: user?.last_name || '', email: user?.email || '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [tzSaving, setTzSaving] = useState(false)
  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.patch('/auth/me', form)
      setUser?.(r.data.data?.user)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const handleTzChange = async (tz) => {
    setTzSaving(true)
    try { await updateTimezone(tz) } catch (e) { console.error(e) } finally { setTzSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={18} style={{ color: 'var(--accent)' }} /> Profile
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <Avatar initials={initials || 'ME'} tint="teal" size={64} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="field"><label>First name</label><input className="input" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} /></div>
          <div className="field"><label>Last name</label><input className="input" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
        </div>
      </div>

      {/* Timezone */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={18} style={{ color: 'var(--accent)' }} /> Timezone
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
          All tutor availability and session times are shown in your selected timezone.
        </div>
        <TimezoneSelector value={user?.timezone || ''} onChange={handleTzChange} label="Your timezone" />
        {tzSaving && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Saving…</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button className="btn btn-ghost">Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saved ? <><Check size={16} strokeWidth={2.4} /> Saved</> : saving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
        </button>
      </div>

      {/* Security */}
      <ChangePasswordCard />
    </div>
  )
}

// ── Chat ────────────────────────────────────────────────────────
function ChatPage({ enrollments }) {
  const { user } = useAuth()
  const location   = useLocation()
  const [convos,       setConvos]       = useState([])
  const [activeId,     setActiveId]     = useState(null)
  const [messages,     setMessages]     = useState([])
  const [otherUser,    setOtherUser]    = useState(null)
  const [text,         setText]         = useState('')
  const [sending,      setSending]      = useState(false)
  const [loadingConvo, setLoadingConvo] = useState(false)
  const [loadingList,  setLoadingList]  = useState(true)
  const bottomRef = useRef(null)

  // Collect unique tutors from enrollments to surface as potential contacts
  const myTutors = enrollments
    .filter(e => e.tutor)
    .reduce((acc, e) => {
      if (!acc.some(t => t.id === e.tutor.id)) acc.push(e.tutor)
      return acc
    }, [])

  const loadConversations = () => {
    setLoadingList(true)
    api.get('/messages/conversations')
      .then(r => setConvos(r.data.data?.conversations || []))
      .catch(() => {})
      .finally(() => setLoadingList(false))
  }

  useEffect(() => { loadConversations() }, [])

  // Auto-open a conversation if navigated with state
  useEffect(() => {
    const state = location.state
    if (state?.openUserId && state?.openUserName) {
      openOrCreateConvo(state.openUserId, state.openUserName)
      window.history.replaceState({}, '')
    }
  }, [])

  const openConvo = async (id) => {
    setActiveId(id)
    setLoadingConvo(true)
    try {
      const r = await api.get(`/messages/conversations/${id}`)
      const data = r.data.data
      setMessages(data.messages || [])
      const me = data.conversation?.participants?.find(p => p.user_id !== user?.userId && p.user_id !== user?.id)
      setOtherUser(me?.user || null)
    } catch (e) {
      setMessages([])
    } finally { setLoadingConvo(false) }
  }

  const openOrCreateConvo = async (userId, userName) => {
    try {
      const r = await api.post('/messages/conversations', { user_id: userId })
      const convo = r.data.data?.conversation
      if (convo) {
        await loadConversations()
        setActiveId(convo.id)
        setOtherUser({ first_name: userName?.split(' ')[0] || '', last_name: userName?.split(' ').slice(1).join(' ') || '' })
        const mr = await api.get(`/messages/conversations/${convo.id}`)
        setMessages(mr.data.data?.messages || [])
      }
    } catch (e) { console.error(e) }
  }

  const sendMessage = async () => {
    if (!text.trim() || !activeId || sending) return
    setSending(true)
    const optimistic = { id: `tmp-${Date.now()}`, content: text.trim(), sender_id: user?.userId, sent_at: new Date().toISOString(), sender: { first_name: user?.first_name, last_name: user?.last_name } }
    setMessages(p => [...p, optimistic])
    setText('')
    try {
      const r = await api.post(`/messages/conversations/${activeId}/messages`, { content: optimistic.content })
      setMessages(p => p.map(m => m.id === optimistic.id ? r.data.data.message : m))
      loadConversations()
    } catch (e) {
      setMessages(p => p.filter(m => m.id !== optimistic.id))
      setText(optimistic.content)
    } finally { setSending(false) }
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const myId = user?.userId || user?.id

  return (
    <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - 200px)', minHeight: 400 }}>
      {/* Left: conversation list */}
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, fontFamily: 'var(--font-display)' }}>Messages</div>

        {/* Quick-start: tutor contacts from enrollments */}
        {myTutors.length > 0 && convos.length === 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 10 }}>Your mentors</div>
            {myTutors.map(t => (
              <button key={t.id} onClick={() => openOrCreateConvo(t.id, `${t.first_name} ${t.last_name}`)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--bg2)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8, transition: 'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
                <Avatar initials={`${t.first_name?.[0]||''}${t.last_name?.[0]||''}`} tint="violet" size={36} />
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.first_name} {t.last_name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 12 }}>Tap to start chatting</div>
                </div>
                <MessageSquare size={15} style={{ color: 'var(--text3)' }} />
              </button>
            ))}
          </div>
        )}

        {loadingList
          ? <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 18, height: 18 }} /></div>
          : convos.map(c => {
              const other = c.other_participant
              const init  = `${other?.first_name?.[0]||''}${other?.last_name?.[0]||''}`.toUpperCase() || '?'
              const sel   = activeId === c.id
              return (
                <button key={c.id} onClick={() => openConvo(c.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px', borderRadius: 12,
                  background: sel ? 'var(--accent-light)' : 'transparent', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', marginBottom: 4, transition: 'background .15s', textAlign: 'left',
                }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg2)' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}>
                  <Avatar initials={init} tint="violet" size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: sel ? 'var(--accent)' : 'var(--text)' }}>
                      {other?.first_name} {other?.last_name}
                      {other?.username && <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--accent)', fontWeight: 600, opacity: 0.8 }}>@{other.username}</span>}
                    </div>
                    {c.last_message && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.last_message.content}
                      </div>
                    )}
                  </div>
                  {c.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                </button>
              )
            })
        }
        {!loadingList && convos.length === 0 && myTutors.length === 0 && (
          <EmptyState text="No messages yet. Your mentors will appear here once assigned." />
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />

      {/* Right: message thread */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!activeId ? (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text3)', fontSize: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <MessageSquare size={40} style={{ margin: '0 auto 12px', opacity: .3 }} />
              <div>Select a conversation to start messaging</div>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            {otherUser && (
              <div style={{ padding: '0 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar initials={`${otherUser.first_name?.[0]||''}${otherUser.last_name?.[0]||''}`} tint="violet" size={40} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{otherUser.first_name} {otherUser.last_name}{otherUser.username && <span style={{ marginLeft: 7, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>@{otherUser.username}</span>}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 12.5, textTransform: 'capitalize' }}>{otherUser.role || 'Mentor'}</div>
                </div>
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4, marginBottom: 16 }}>
              {loadingConvo
                ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 20, height: 20 }} /></div>
                : messages.length === 0
                ? <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 14, paddingTop: 40 }}>No messages yet — say hello!</div>
                : messages.map(msg => {
                    const isMe = (msg.sender_id || msg.sender?.id) === myId
                    return (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '72%', padding: '10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          background: isMe ? 'var(--accent)' : 'var(--bg2)',
                          color: isMe ? '#fff' : 'var(--text)',
                          fontSize: 14, lineHeight: 1.5,
                          boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                        }}>
                          {msg.content}
                          <div style={{ fontSize: 11, opacity: .65, marginTop: 4, textAlign: isMe ? 'right' : 'left' }}>
                            {msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })
              }
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <textarea
                className="form-input"
                rows={1}
                placeholder="Type a message…"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                style={{ flex: 1, resize: 'none', borderRadius: 12, minHeight: 42, maxHeight: 120, lineHeight: 1.5 }}
              />
              <button className="btn btn-primary" style={{ height: 42, padding: '0 16px', flexShrink: 0 }}
                disabled={!text.trim() || sending} onClick={sendMessage}>
                <Send size={17} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── PaymentReceiptModal (shared — used by student Billing and admin) ───────
export function PaymentReceiptModal({ payment, onClose }) {
  useEscape(onClose, !!payment)
  if (!payment) return null
  const fmtCents = c => '$' + (c / 100).toFixed(2)
  const planName  = payment.managed_plan?.name || payment.plan?.plan_type || 'Plan'
  const enrollments = payment.module_enrollments || []
  const isRefunded  = payment.status === 'refunded'

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(24,23,31,.45)', backdropFilter: 'blur(5px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label="Payment receipt" onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 22, boxShadow: '0 25px 50px -12px rgba(0,0,0,.28)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header strip */}
        <div style={{ background: 'linear-gradient(135deg,#1B3A6B,#2d5ba8)', padding: '24px 28px 20px', color: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Receipt size={20} />
              <span style={{ fontWeight: 700, fontSize: 16 }}>Payment receipt</span>
            </div>
            <button onClick={onClose} style={{ padding: 6, background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', color: '#fff', borderRadius: 8, display: 'flex' }}><X size={16} /></button>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.04em',
            textDecoration: isRefunded ? 'line-through' : 'none', opacity: isRefunded ? 0.6 : 1 }}>
            {fmtCents(payment.amount_cents)}
          </div>
          {isRefunded && (
            <div style={{ display: 'inline-block', marginTop: 6, padding: '3px 10px', borderRadius: 999, background: 'rgba(239,68,68,.25)', color: '#fca5a5', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Refunded
            </div>
          )}
          <div style={{ opacity: .75, fontSize: 13, marginTop: 6 }}>{payment.currency?.toUpperCase()} · {new Date(payment.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>

        {/* Body — scrollable */}
        <div style={{ padding: '20px 28px 28px', overflowY: 'auto', flex: 1 }}>

          {/* Summary rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 20 }}>
            {[
              ['Receipt No.',  payment.receipt_number || payment.id?.slice(0, 8).toUpperCase()],
              ['Plan',         planName],
              payment.discount_cents > 0 ? ['Discount',  `-${fmtCents(payment.discount_cents)}`] : null,
              ['Status',       payment.status],
              ['Payment ID',   payment.stripe_payment_intent_id?.slice(0, 20) || '—'],
            ].filter(Boolean).map(([label, val], i, arr) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: 280, wordBreak: 'break-word',
                  color: label === 'Status' ? (payment.status === 'succeeded' ? 'var(--success)' : payment.status === 'refunded' ? 'var(--danger)' : 'var(--text)') : 'var(--text)',
                  textTransform: label === 'Status' ? 'capitalize' : 'none',
                }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Per-module credit breakdown */}
          {enrollments.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                Credits included
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enrollments.map(e => {
                  const name      = e.module?.name || e.module?.title || 'Module'
                  const purchased = e.credits_purchased ?? null
                  return (
                    <div key={e.id || e.module_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{name}</span>
                      {purchased !== null
                        ? <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: '#2563eb' }}>{purchased} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>credits</span></span>
                        : <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>—</span>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            {payment.receipt_url && (
              <a href={payment.receipt_url} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, height: 42, borderRadius: 10, background: '#1B3A6B', color: '#fff', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, textDecoration: 'none' }}>
                <ExternalLink size={14} /> View on Stripe
              </a>
            )}
            <button onClick={onClose} style={{ flex: 1, height: 42, borderRadius: 10, background: 'var(--bg2)', color: 'var(--text)', fontWeight: 700, fontSize: 13.5, border: 'none', cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Certifications ───────────────────────────────────────────────
function CertificationsPage() {
  const [certs, setCerts]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/students/me/certifications')
      .then(r => setCerts(r.data.data?.certifications || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const STATUS_META = {
    pending:        { label: 'Pending',          color: '#d97706', bg: '#fef3c7' },
    tutor_approved: { label: 'Tutor Approved',   color: '#2563eb', bg: '#dbeafe' },
    approved:       { label: 'Issued',           color: '#059669', bg: '#d1fae5' },
    rejected:       { label: 'Rejected',         color: '#dc2626', bg: '#fee2e2' },
    revoked:        { label: 'Revoked',          color: '#6b7280', bg: '#f3f4f6' },
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <span className="spinner" role="status" aria-label="Loading" style={{ width: 28, height: 28 }} />
    </div>
  )

  if (!certs.length) return (
    <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--text3)' }}>
      <Award size={40} strokeWidth={1.4} style={{ marginBottom: 14, opacity: .5 }} />
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text2)', marginBottom: 6 }}>No certificates yet</div>
      <div style={{ fontSize: 14 }}>Complete 2 sessions in a module to become eligible for a certificate.</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {certs.map(cert => {
        const meta    = STATUS_META[cert.status] || STATUS_META.pending
        const subject = cert.module?.name || cert.course?.title || 'Module'
        const tutorName = cert.tutor ? `${cert.tutor.first_name} ${cert.tutor.last_name}` : '—'
        return (
          <div key={cert.id} className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Award size={22} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{subject}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 3 }}>
                Mentor: {tutorName}
                {cert.completion_date && <span style={{ marginLeft: 12 }}>Completed: {fmtDate(cert.completion_date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                {cert.issued_date && <span style={{ marginLeft: 12 }}>Issued: {fmtDate(cert.issued_date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: meta.bg, color: meta.color }}>{meta.label}</span>
              {cert.status === 'approved' && cert.pdf_url && (
                <a href={cert.pdf_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  <Download size={14} /> Download
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Billing ──────────────────────────────────────────────────────
function BillingPage() {
  const [payments,      setPayments]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [receipt,       setReceipt]       = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)

  useEffect(() => {
    api.get('/payments/history').then(r => setPayments(r.data.data?.payments || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const openReceipt = async (p) => {
    setReceiptLoading(true)
    try {
      const r = await api.get(`/payments/receipt/${p.id}`)
      setReceipt(r.data.data?.payment || p)
    } catch {
      setReceipt(p) // fallback to list data if fetch fails
    } finally {
      setReceiptLoading(false)
    }
  }

  const totalSpent = payments.filter(p => p.status === 'succeeded').reduce((s, p) => s + p.amount_cents, 0)
  const fmtMoney   = c => '$' + (c / 100).toFixed(2)

  const planLabel  = p => p.managed_plan?.name || p.plan?.plan_type || 'Plan'
  const statusColor = s => s === 'succeeded' ? 'var(--success)' : s === 'refunded' ? 'var(--danger)' : 'var(--text3)'
  const statusLabel = s => s === 'succeeded' ? 'Paid' : s === 'refunded' ? 'Refunded' : s

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
        <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#e1f5f1', color: '#0f9b8e', display: 'grid', placeItems: 'center', flexShrink: 0 }}><CreditCard size={20} /></div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em' }}>{fmtMoney(totalSpent)}</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Total spent</div>
          </div>
        </div>
        <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ecebfd', color: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Receipt size={20} /></div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em' }}>{payments.length}</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Total payments</div>
          </div>
        </div>
      </div>

      {/* Payment list */}
      <h2 style={{ fontSize: 17, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 14 }}>Payment history</h2>
      {payments.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', borderStyle: 'dashed' }}>
          <CreditCard size={36} style={{ color: 'var(--text3)', margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>No payments yet</div>
          <div style={{ color: 'var(--text3)', fontSize: 14 }}>Your payment receipts will appear here after your first purchase.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {payments.map(p => {
            const modules = (p.module_enrollments || []).map(e => e.module?.name || 'Module')
            return (
              <div key={p.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Icon */}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: p.status === 'refunded' ? 'var(--danger-bg,#fef2f2)' : '#e7effe', color: p.status === 'refunded' ? 'var(--danger)' : '#2563eb', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <CreditCard size={19} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{planLabel(p)}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      background: p.status === 'succeeded' ? '#dcfce7' : p.status === 'refunded' ? 'var(--danger-bg,#fef2f2)' : 'var(--bg2)',
                      color: statusColor(p.status) }}>
                      {statusLabel(p.status)}
                    </span>
                  </div>
                  {modules.length > 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 2 }}>{modules.join(' · ')}</div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {p.receipt_number && <> · <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text2)' }}>{p.receipt_number}</span></>}
                  </div>
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em',
                    textDecoration: p.status === 'refunded' ? 'line-through' : 'none', color: p.status === 'refunded' ? 'var(--text3)' : 'var(--text)' }}>
                    {fmtMoney(p.amount_cents)}
                  </div>
                  <button
                    onClick={() => openReceipt(p)}
                    disabled={receiptLoading}
                    style={{ marginTop: 5, fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: receiptLoading ? 'default' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, opacity: receiptLoading ? 0.5 : 1 }}>
                    <Receipt size={12} /> View receipt
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {receipt && <PaymentReceiptModal payment={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}

// ── Main export ─────────────────────────────────────────────────
export default function StudentDashboard() {
  usePageTitle('My Dashboard')
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [enrollments, setEnrollments] = useState([])
  const [sessions,    setSessions]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [bookModal,   setBookModal]   = useState({ open: false, enrollmentId: null })

  const loadData = () => {
    return Promise.all([
      api.get('/students/me/module-enrollments').catch(() => ({ data: { data: { enrollments: [] } } })),
      api.get('/sessions/my').catch(() => ({ data: { data: { sessions: [] } } })),
    ]).then(([er, sr]) => {
      setEnrollments(er.data.data?.enrollments || [])
      setSessions(sr.data.data?.sessions || [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  // Real-time session updates
  useEffect(() => {
    const s = getSocket()
    const refresh = () => loadData()
    s.on('session:new',     refresh)
    s.on('session:updated', refresh)
    return () => { s.off('session:new', refresh); s.off('session:updated', refresh) }
  }, [])

  const openBook = (enrollmentId) => setBookModal({ open: true, enrollmentId: String(enrollmentId) })

  const activeEnrollment = bookModal.enrollmentId
    ? enrollments.find(e => String(e.id) === bookModal.enrollmentId)
    : null

  // Derive title from route
  const path = location.pathname
  let title = `Hi ${user?.first_name || 'there'}`, subtitle = "Here's where your journey stands today."

  // Schedule button: opens booking for first eligible enrollment (has tutor + credits)
  const firstBookable = enrollments.find(e => e.tutor && (e.credits_remaining ?? 0) > 0)
  let headRight = (
    <button className="btn btn-primary btn-sm"
      onClick={() => firstBookable ? openBook(firstBookable.id) : navigate('/dashboard')}
      disabled={!firstBookable}>
      <Plus size={16} /> Schedule
    </button>
  )

  if (path.startsWith('/dashboard/billing')) {
    title = 'Billing'; subtitle = 'Your payment history and receipts.'
    headRight = null
  } else if (path.startsWith('/dashboard/meetings')) {
    title = 'Meetings'; subtitle = 'Every session across your modules, in one place.'
    headRight = null
  } else if (path.startsWith('/dashboard/notifications')) {
    title = 'Notifications'; subtitle = 'Messages, confirmations, and announcements.'
    headRight = null
  } else if (path.startsWith('/dashboard/chat')) {
    title = 'Messages'; subtitle = 'Chat directly with your mentors.'
    headRight = null
  } else if (path.startsWith('/dashboard/support')) {
    title = 'Support'; subtitle = 'Submit an issue and track its progress.'
    headRight = null
  } else if (path.startsWith('/dashboard/certifications')) {
    title = 'Certifications'; subtitle = 'Your earned certificates and their status.'
    headRight = null
  } else if (path.startsWith('/dashboard/settings')) {
    title = 'Settings'; subtitle = 'Manage your profile and security.'
    headRight = null
  } else if (path.startsWith('/dashboard/modules/')) {
    const id   = path.split('/').pop()
    const e    = enrollments.find(e => String(e.id) === id)
    title      = e?.module?.title || e?.module_name || 'Module'
    subtitle   = '1 credit = one 90-min session'
    headRight  = <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}><ArrowLeft size={16} /> Modules</button>
  }

  return (
    <>
    <DashShell title={title} subtitle={subtitle} headRight={headRight} enrollments={enrollments}>
      <Routes>
        <Route index element={<ModulesPage enrollments={enrollments} sessions={sessions} loading={loading} onBook={openBook} />} />
        <Route path="modules/:enrollmentId" element={<ModuleDetailPage enrollments={enrollments} sessions={sessions} onBook={openBook} />} />
        <Route path="meetings/*"       element={<MeetingsPage sessions={sessions} onRated={id => setSessions(p => p.map(s => s.id === id ? { ...s, has_review: true } : s))} />} />
        <Route path="chat/*"           element={<ChatPage enrollments={enrollments} />} />
        <Route path="certifications"   element={<CertificationsPage />} />
        <Route path="billing"          element={<BillingPage />} />
        <Route path="notifications"    element={<NotificationsPage />} />
        <Route path="support"          element={<SupportPage />} />
        <Route path="settings"         element={<SettingsPage />} />
      </Routes>

      {bookModal.open && activeEnrollment && (
        <ScheduleModal
          enrollment={activeEnrollment}
          onClose={() => setBookModal({ open: false, enrollmentId: null })}
          onBooked={() => {
            setBookModal({ open: false, enrollmentId: null })
            loadData().then(() => navigate('/dashboard/meetings'))
          }}
        />
      )}
    </DashShell>

    <HelpChatWidget />
    </>
  )
}
