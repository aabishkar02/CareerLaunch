import { confirmDialog } from '../../components/ConfirmDialog'
import { toast } from '../../services/toast'
import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import HelpChatWidget from '../../components/HelpChatWidget'
import { getSocket } from '../../services/socket'
import {
  Calendar, CalendarDays, Layers, Star, Bell, LogOut, Check, Clock,
  Video, ExternalLink, ChevronRight, X, Zap, User,
  DollarSign, TrendingUp, Folder, Link as LinkIcon, ArrowLeft,
  MessageSquare, Send, FileText, Landmark, Save, ShieldCheck, Pencil,
  Settings as SettingsIcon, CheckCheck, Award
} from 'lucide-react'
import TutorCalendarPage from './CalendarPage'
import ChangePasswordCard from '../../components/ChangePasswordCard'
import usePageTitle from '../../utils/usePageTitle'
import useTabParam from '../../utils/useTabParam'

// ── Helpers ────────────────────────────────────────────────────
const TINTS = { indigo:{bg:'#ecebfd',fg:'var(--accent)'}, violet:{bg:'#efeaff',fg:'#7c5cff'}, blue:{bg:'#e7effe',fg:'#2563eb'}, teal:{bg:'#e1f5f1',fg:'#0f9b8e'}, amber:{bg:'#fbf0db',fg:'#d98a1f'} }
const TINT_KEYS = ['indigo','violet','indigo','blue','teal','violet','amber','blue']
const tintOf = i => TINT_KEYS[i%TINT_KEYS.length]
const monoOf = (n='') => (n.match(/\b[A-Z]/g)||[]).join('').slice(0,2).toUpperCase()||n.slice(0,2).toUpperCase()

function fmtDate(iso, opts) {
  if(!iso) return ''; return new Date(iso+(iso.length===10?'T00:00:00':'')).toLocaleDateString('en-US',opts||{month:'short',day:'numeric'})
}
function to12(t='') {
  if(!t) return ''; let [h,m]=t.split(':').map(Number); const ap=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${String(m).padStart(2,'0')} ${ap}`
}
function fmtMoney(n) { return '$'+Number(n||0).toLocaleString('en-US') }

function Avatar({ initials, tint='violet', size=40 }) {
  const c=TINTS[tint]||TINTS.violet
  return <div style={{ width:size, height:size, borderRadius:'50%', background:c.bg, color:c.fg, display:'grid', placeItems:'center', fontFamily:'var(--font-display)', fontWeight:600, fontSize:size*.4, flexShrink:0, letterSpacing:'-0.02em' }}>{initials}</div>
}
function ModTile({ mono, tint='indigo', size=46 }) {
  const c=TINTS[tint]||TINTS.indigo
  return <div style={{ width:size, height:size, borderRadius:size*.3, background:c.bg, color:c.fg, display:'grid', placeItems:'center', fontFamily:'var(--font-display)', fontWeight:700, fontSize:size*.36, flexShrink:0, letterSpacing:'-0.03em' }}>{mono}</div>
}
function StarRating({ value=5, size=13 }) {
  return <span style={{ display:'inline-flex', gap:1.5 }}>{[0,1,2,3,4].map(i=><Star key={i} size={size} fill={i<Math.round(value)?'var(--credit)':'none'} strokeWidth={1.6} style={{ color:i<Math.round(value)?'var(--credit)':'var(--border)' }} />)}</span>
}
function EmptyState({ text }) {
  return <div className="card" style={{ padding:20, textAlign:'center', color:'var(--text3)', fontSize:14, borderStyle:'dashed' }}>{text}</div>
}

// ── StudentProfileModal ─────────────────────────────────────────
function StudentProfileModal({ student, sessions, onClose }) {
  if (!student) return null
  const firstName       = student.student_first_name || student.student?.first_name || student.first_name || ''
  const lastName        = student.student_last_name  || student.student?.last_name  || student.last_name  || ''
  const email           = student.student?.email || student.email || ''
  const studentId       = student.student_id    || student.student?.id  || student.id
  const studentUsername = student.student_username || student.student?.username || null
  const init            = `${firstName[0]||''}${lastName[0]||''}`.toUpperCase() || '?'

  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!studentId) return
    api.get(`/tutors/me/students/${studentId}`)
      .then(r => setDetail(r.data.data))
      .catch(() => {})
  }, [studentId])

  const studentSessions = (sessions || []).filter(s =>
    (s.student_id || s.student?.id) === studentId
  ).sort((a, b) => (b.scheduled_date || '').localeCompare(a.scheduled_date || ''))

  const completed = studentSessions.filter(s => s.status === 'completed').length
  const upcoming  = studentSessions.filter(s => s.status === 'confirmed' || s.status === 'pending').length
  const moduleSessions = detail?.module_sessions || []

  return (
    <div onMouseDown={onClose} style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(24,23,31,.42)', backdropFilter:'blur(4px)', display:'grid', placeItems:'center', padding:20 }}>
      <div onMouseDown={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:460, maxHeight:'86vh', overflowY:'auto', background:'#fff', borderRadius:22, boxShadow:'0 25px 50px -12px rgba(0,0,0,.25)', padding:28 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:18, fontFamily:'var(--font-display)' }}>Student profile</div>
          <button onClick={onClose} style={{ padding:6, background:'none', border:'none', cursor:'pointer', color:'var(--text3)', display:'flex', borderRadius:8 }}><X size={18} /></button>
        </div>
        <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:20 }}>
          <Avatar initials={init} tint="teal" size={60} />
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:18, fontFamily:'var(--font-display)' }}>{firstName} {lastName}</div>
            {studentUsername && <div style={{ fontSize:12.5, color:'var(--accent)', fontWeight:600, marginTop:1 }}>@{studentUsername}</div>}
            {email && <div style={{ color:'var(--text3)', fontSize:13, marginTop:2 }}>{email}</div>}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          <div className="card" style={{ padding:'14px 16px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:24 }}>{completed}</div>
            <div style={{ color:'var(--text3)', fontSize:12, marginTop:2 }}>completed</div>
          </div>
          <div className="card" style={{ padding:'14px 16px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:24 }}>{upcoming}</div>
            <div style={{ color:'var(--text3)', fontSize:12, marginTop:2 }}>upcoming</div>
          </div>
        </div>

        {/* Per-module session progress */}
        {moduleSessions.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:13, color:'var(--text2)', marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em' }}>Module progress</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {moduleSessions.map(m => {
                const required = m.cert_sessions_required
                const done     = m.completed_sessions
                const pct      = required ? Math.min(100, Math.round((done / required) * 100)) : null
                const eligible = required && done >= required
                return (
                  <div key={m.module_id} style={{ padding:'12px 14px', borderRadius:12, background:'var(--bg2)' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: pct != null ? 8 : 0 }}>
                      <span style={{ fontWeight:600, fontSize:13 }}>{m.module_name}</span>
                      <span style={{ fontSize:12.5, color:'var(--text3)', fontWeight:600 }}>
                        {done} session{done !== 1 ? 's' : ''} completed
                        {required ? ` / ${required} for cert` : ''}
                      </span>
                    </div>
                    {pct != null && (
                      <div style={{ position:'relative', height:5, borderRadius:999, background:'var(--border)', overflow:'hidden' }}>
                        <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${pct}%`, borderRadius:999, background: eligible ? '#059669' : 'var(--accent)', transition:'width .4s' }} />
                      </div>
                    )}
                    {eligible && (
                      <div style={{ fontSize:11.5, color:'#059669', fontWeight:700, marginTop:5, display:'flex', alignItems:'center', gap:4 }}>
                        <Award size={12} /> Eligible for certification
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {studentSessions.length > 0 && (
          <>
            <div style={{ fontWeight:700, fontSize:13, color:'var(--text2)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Recent sessions</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {studentSessions.slice(0, 5).map(s => (
                <div key={s.id} style={{ padding:'10px 14px', borderRadius:12, background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:13 }}>
                  <span style={{ fontWeight:600 }}>{s.subject || s.topic || 'Session'}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ color:'var(--text3)' }}>{fmtDate(s.scheduled_date)}</span>
                    <span className={`chip ${s.status==='completed'?'chip-good':''}`} style={{ fontSize:11 }}>{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
function SegTabs({ tabs, value, onChange }) {
  return (
    <div style={{ display:'flex', gap:6, background:'var(--bg2)', padding:4, borderRadius:999, width:'fit-content' }}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>onChange(t.id)} style={{ height:36, padding:'0 16px', borderRadius:999, fontWeight:600, fontSize:14, display:'flex', alignItems:'center', gap:7, background:value===t.id?'#fff':'transparent', color:value===t.id?'var(--text)':'var(--text2)', boxShadow:value===t.id?'var(--shadow-xs)':'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
          {t.label}{t.count!=null&&<span style={{ fontSize:12, padding:'1px 7px', borderRadius:999, background:value===t.id?'var(--accent-light)':'var(--border)', color:value===t.id?'var(--accent)':'var(--text2)', fontWeight:700 }}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ── Logo ────────────────────────────────────────────────────────
function Logo({ onClick }) {
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:9, cursor:'pointer', userSelect:'none' }}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" style={{ flexShrink:0 }}>
        <path d="M16 1.5 19.4 12.6 30.5 16 19.4 19.4 16 30.5 12.6 19.4 1.5 16 12.6 12.6Z" fill="var(--accent)"/>
        <path d="M16 8.5 17.7 14.3 23.5 16 17.7 17.7 16 23.5 14.3 17.7 8.5 16 14.3 14.3Z" fill="white" opacity=".82"/>
      </svg>
      <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:16, letterSpacing:'-0.03em', color:'var(--text)' }}>Career<span style={{ color:'var(--accent)' }}>Launch</span></span>
    </div>
  )
}

// ── Unread context (shared between shell badge and notifications page) ──
const UnreadContext = createContext(() => {})

// ── Shell ────────────────────────────────────────────────────────
function TutorShell({ active, children, title, subtitle, headRight, stats }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = `${user?.first_name?.[0]||''}${user?.last_name?.[0]||''}`
  const { pending=0, upcoming=0 } = stats||{}
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    api.get('/notifications/me').then(r => setUnread(r.data.data?.unread_count || 0)).catch(() => {})
  }, [])

  const nav = [
    { id:'meetings',      label:'Meetings',        icon:Calendar,      path:'/tutor',                    exact:true,  badge:pending||null },
    { id:'courses',       label:'Courses',          icon:Layers,        path:'/tutor/courses',            exact:false, dot:pending>0 },
    { id:'calendar',      label:'Calendar',         icon:CalendarDays,  path:'/tutor/calendar',           exact:false },
    { id:'payroll',       label:'Payroll',          icon:DollarSign,    path:'/tutor/payroll',            exact:false },
    { id:'banking',       label:'Banking',          icon:Landmark,      path:'/tutor/banking',            exact:false },
    { id:'chat',          label:'Messages',         icon:MessageSquare, path:'/tutor/chat',               exact:false },
    { id:'notifications', label:'Notifications',    icon:Bell,          path:'/tutor/notifications',      exact:false, badge:unread||null },
    { id:'settings',      label:'Settings',         icon:SettingsIcon,  path:'/tutor/settings',           exact:false },
  ]

  const handleLogout = async () => { await logout(); navigate('/') }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>
      {/* sidebar */}
      <aside style={{ width:252, flexShrink:0, background:'#fff', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', position:'sticky', top:0, height:'100vh' }}>
        <div style={{ padding:'20px 20px 14px' }}>
          <Logo onClick={()=>navigate('/')} />
          <div style={{ marginTop:12, display:'inline-flex', alignItems:'center', gap:7, padding:'4px 10px 4px 8px', borderRadius:999, background:'#efeaff', color:'#7c5cff', fontSize:12, fontWeight:700, letterSpacing:'.02em' }}>
            <User size={14} /> Tutor portal
          </div>
        </div>
        <div style={{ padding:'4px 12px', display:'flex', flexDirection:'column', gap:3, overflowY:'auto', flex:1 }}>
          {nav.map(n=>{
            const on = n.exact ? location.pathname==='/tutor' : location.pathname.startsWith(n.path)
            return (
              <button key={n.id} onClick={()=>navigate(n.path)} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 12px', borderRadius:11, textAlign:'left', background:on?'var(--accent-light)':'transparent', color:on?'var(--accent)':'var(--text2)', fontWeight:on?700:600, fontSize:14, position:'relative', transition:'background .15s', border:'none', cursor:'pointer', fontFamily:'inherit' }}
                onMouseEnter={e=>{if(!on)e.currentTarget.style.background='var(--bg2)'}}
                onMouseLeave={e=>{if(!on)e.currentTarget.style.background='transparent'}}>
                <n.icon size={18} strokeWidth={on?2:1.8} />
                <span style={{ flex:1 }}>{n.label}</span>
                {n.badge&&<span style={{ minWidth:20, height:20, padding:'0 6px', borderRadius:999, background:'var(--danger)', color:'#fff', fontSize:11, fontWeight:700, display:'grid', placeItems:'center' }}>{n.badge}</span>}
                {n.dot&&!n.badge&&<Zap size={13} fill="var(--danger)" strokeWidth={0} />}
              </button>
            )
          })}
        </div>
        {/* week summary */}
        <div style={{ padding:14, borderTop:'1px solid var(--border)' }}>
          <div style={{ borderRadius:14, padding:14, border:'1px solid var(--border)', background:'#fbfaf7' }}>
            <div style={{ color:'var(--text3)', fontSize:11.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em' }}>This week</div>
            <div style={{ display:'flex', gap:14, marginTop:8 }}>
              <div><div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:22, color:'var(--accent)' }}>{pending}</div><div style={{ color:'var(--text3)', fontSize:11 }}>requests</div></div>
              <div><div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:22 }}>{upcoming}</div><div style={{ color:'var(--text3)', fontSize:11 }}>upcoming</div></div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:12, padding:'6px 4px' }}>
            <Avatar initials={initials||'TU'} tint="violet" size={36} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:13.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.first_name} {user?.last_name}</div>
              {user?.username && <div style={{ color:'var(--accent)', fontSize:11, fontWeight:600 }}>@{user.username}</div>}
              <div style={{ color:'var(--text3)', fontSize:11.5 }}>Mentor</div>
            </div>
            <button onClick={handleLogout} style={{ padding:7, background:'none', border:'none', cursor:'pointer', color:'var(--text3)', display:'flex' }}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      {/* main */}
      <main style={{ flex:1, minWidth:0 }}>
        <header style={{ position:'sticky', top:0, zIndex:40, background:'rgba(246,245,241,.88)', backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)' }}>
          <div style={{ padding:'0 32px', height:70, display:'flex', alignItems:'center', justifyContent:'space-between', gap:20 }}>
            <div style={{ minWidth:0 }}>
              <h1 style={{ fontSize:22, letterSpacing:'-0.02em', fontFamily:'var(--font-display)', fontWeight:700, margin:0 }}>{title}</h1>
              {subtitle&&<div style={{ color:'var(--text3)', fontSize:13, marginTop:1 }}>{subtitle}</div>}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {headRight}
              <Avatar initials={initials||'TU'} tint="violet" size={42} />
            </div>
          </div>
        </header>
        <div style={{ padding:'28px 32px 64px', maxWidth:1120, margin:'0 auto' }}>
          <UnreadContext.Provider value={setUnread}>
            {children}
          </UnreadContext.Provider>
        </div>
      </main>
    </div>
  )
}

// ── Meetings (Requested / Upcoming / Completed) ─────────────────
function TutorMeetingsPage({ sessions, onRefresh }) {
  const [tab, setTab] = useTabParam('requested')
  const [confirmModal, setConfirmModal] = useState(null)
  const [meetingLink, setMeetingLink] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [completing, setCompleting] = useState(null)
  const [profileStudent, setProfileStudent] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [editLink, setEditLink] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Reload whenever this page is visited so new student bookings appear immediately
  useEffect(() => { onRefresh?.() }, [])

  const handleComplete = async (id) => {
    if (!(await confirmDialog("Mark this session as completed? The student's held credit for this session becomes final."))) return
    setCompleting(id)
    try {
      await api.patch(`/sessions/${id}/complete`)
      onRefresh?.()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to mark complete')
    } finally { setCompleting(null) }
  }

  const requested = sessions.filter(s=>s.status==='pending'||s.status==='requested')
  const upcoming  = sessions.filter(s=>s.status==='confirmed'||s.status==='upcoming'||s.status==='scheduled').sort((a,b)=>(a.scheduled_date||'').localeCompare(b.scheduled_date||''))
  const completed = sessions.filter(s=>s.status==='completed').sort((a,b)=>(b.scheduled_date||'').localeCompare(a.scheduled_date||''))

  const handleConfirm = async () => {
    if(!confirmModal) return
    setConfirming(true)
    try {
      await api.post(`/sessions/${confirmModal.id}/confirm`, { meeting_link: meetingLink || undefined })
      setConfirmModal(null); onRefresh?.()
    } catch(e){ console.error(e) } finally { setConfirming(false) }
  }

  const handleDecline = async (id) => {
    if (!(await confirmDialog('Decline this request?'))) return
    await api.post(`/sessions/${id}/decline`).catch(console.error)
    onRefresh?.()
  }

  const openEdit = (session) => {
    setEditModal(session)
    setEditLink(session.meeting_link || '')
    setEditNotes(session.tutor_notes || '')
  }

  const handleSaveLink = async () => {
    if (!editModal) return
    setEditSaving(true)
    try {
      await api.patch(`/sessions/${editModal.id}/link`, { meeting_link: editLink, tutor_notes: editNotes })
      setEditModal(null)
      onRefresh?.()
    } catch(e) { toast.error(e.response?.data?.error || 'Failed to save') } finally { setEditSaving(false) }
  }

  const StuInit = mt => {
    const fn = mt.student_first_name||mt.student?.first_name||''
    const ln = mt.student_last_name ||mt.student?.last_name ||''
    return (fn[0]||'')+(ln[0]||'S')
  }

  return (
    <>
      <div style={{ marginBottom:22 }}>
        <SegTabs value={tab} onChange={setTab} tabs={[
          { id:'requested', label:'Requested',  count:requested.length },
          { id:'upcoming',  label:'Upcoming',   count:upcoming.length  },
          { id:'completed', label:'Completed',  count:completed.length },
        ]} />
      </div>

      {tab==='requested' && (
        requested.length===0 ? <EmptyState text="No pending requests. You're all caught up!" /> :
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {requested.map(r=>(
            <div key={r.id} className="card" style={{ padding:20, borderLeft:'3px solid var(--accent)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>
                <Avatar initials={StuInit(r)} tint="teal" size={46} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <button onClick={()=>setProfileStudent(r)} style={{ background:'none', border:'none', padding:0, fontWeight:700, fontSize:15.5, cursor:'pointer', color:'var(--accent)', fontFamily:'inherit', textAlign:'left' }}>{r.student_first_name||r.student?.first_name||'Student'} {r.student_last_name||r.student?.last_name||''}</button>
                    {(r.student_username||r.student?.username) && <span style={{ fontSize:12, color:'var(--accent)', fontWeight:600, opacity:0.8 }}>@{r.student_username||r.student?.username}</span>}
                    {r.module_name&&<span className="chip" style={{ padding:'1px 9px', fontSize:11.5 }}>{r.module_name}</span>}
                  </div>
                  {(r.student_email||r.student?.email)&&<div style={{ color:'var(--text3)', fontSize:12.5, marginTop:1 }}>{r.student_email||r.student?.email}</div>}
                  <div style={{ color:'var(--text3)', fontSize:13, marginTop:2 }}>{r.subject||r.topic||'Session request'}</div>
                  {r.scheduled_date&&<div style={{ fontSize:13, fontWeight:600, color:'var(--accent)', marginTop:8, display:'flex', alignItems:'center', gap:7 }}>
                    <Calendar size={15} /> {fmtDate(r.scheduled_date,{weekday:'long',month:'short',day:'numeric'})} · {to12(r.start_time||'')}
                  </div>}
                </div>
                <button className="btn btn-primary btn-sm" onClick={()=>{ setConfirmModal(r); setMeetingLink('') }}>
                  Review <ChevronRight size={15} />
                </button>
              </div>
              {r.student_notes&&(
                <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid var(--border)', color:'var(--text2)', fontSize:13.5 }}>
                  <b>Note:</b> {r.student_notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==='upcoming' && (
        upcoming.length===0 ? <EmptyState text="No confirmed sessions yet." /> :
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {upcoming.map(u=>(
            <div key={u.id} className="card" style={{ padding:18, display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ textAlign:'center', width:52, flexShrink:0 }}>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:21 }}>{fmtDate(u.scheduled_date,{day:'numeric'})||'—'}</div>
                <div style={{ color:'var(--text3)', fontSize:11, fontWeight:600, textTransform:'uppercase' }}>{fmtDate(u.scheduled_date,{month:'short'})}</div>
              </div>
              <div style={{ width:1, height:38, background:'var(--border)' }} />
              <Avatar initials={StuInit(u)} tint="teal" size={42} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{u.subject||u.topic||'Session'}</div>
                <div style={{ color:'var(--text3)', fontSize:13 }}><button onClick={()=>setProfileStudent(u)} style={{ background:'none', border:'none', padding:0, color:'var(--accent)', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>{u.student_first_name||u.student?.first_name||'Student'}</button>{(u.student_username||u.student?.username)&&<span style={{ marginLeft:4, fontSize:11.5, color:'var(--accent)', fontWeight:600, opacity:0.8 }}>@{u.student_username||u.student?.username}</span>}{(u.student_email||u.student?.email)&&<span style={{ fontSize:12 }}> · {u.student_email||u.student?.email}</span>} · {to12(u.start_time||'')} · {u.module_name||''}</div>
              </div>
              {u.meeting_link&&<a href={u.meeting_link} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm"><LinkIcon size={15} /> Join</a>}
              <button className="btn btn-ghost btn-sm" title="Edit link & notes" onClick={() => openEdit(u)}><Pencil size={14} /></button>
              <button
                className="btn btn-primary btn-sm"
                disabled={completing === u.id || new Date().toISOString().slice(0,10) < (u.scheduled_date||'').slice(0,10)}
                title={new Date().toISOString().slice(0,10) < (u.scheduled_date||'').slice(0,10) ? 'Available on the day of the session' : undefined}
                onClick={() => handleComplete(u.id)}>
                {completing === u.id ? <span className="spinner" style={{ width:13, height:13 }} /> : <><Check size={13} /> Done</>}
              </button>
              <span className="chip chip-good">Confirmed</span>
            </div>
          ))}
        </div>
      )}

      {tab==='completed' && (
        completed.length===0 ? <EmptyState text="Completed sessions appear here." /> :
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {completed.map(s=>(
            <div key={s.id} className="card" style={{ padding:16, display:'flex', alignItems:'center', gap:14 }}>
              <Avatar initials={StuInit(s)} tint="teal" size={38} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14.5 }}>{s.subject||s.topic||'Session'}</div>
                <div style={{ color:'var(--text3)', fontSize:12.5 }}><button onClick={()=>setProfileStudent(s)} style={{ background:'none', border:'none', padding:0, color:'var(--accent)', fontWeight:600, fontSize:12.5, cursor:'pointer', fontFamily:'inherit' }}>{s.student_first_name||s.student?.first_name||'Student'}</button>{(s.student_username||s.student?.username)&&<span style={{ marginLeft:4, fontSize:11, color:'var(--accent)', fontWeight:600, opacity:0.8 }}>@{s.student_username||s.student?.username}</span>}{(s.student_email||s.student?.email)&&<span style={{ fontSize:12 }}> · {s.student_email||s.student?.email}</span>} · {fmtDate(s.scheduled_date,{month:'short',day:'numeric'})} · {s.module_name||''}</div>
              </div>
              {s.student_rating&&<span className="chip chip-good"><StarRating value={s.student_rating} size={11} /></span>}
              <span className="chip">{fmtMoney(s.tutor_fee||s.rate||0)}</span>
            </div>
          ))}
        </div>
      )}

      <StudentProfileModal student={profileStudent} sessions={sessions} onClose={()=>setProfileStudent(null)} />

      {/* Confirm modal */}
      {confirmModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(24,23,31,.42)', backdropFilter:'blur(4px)', display:'grid', placeItems:'center', zIndex:1000, padding:20 }} onMouseDown={()=>setConfirmModal(null)}>
          <div onMouseDown={e=>e.stopPropagation()} className="card" style={{ width:'100%', maxWidth:520, padding:28, boxShadow:'var(--shadow-lg)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
              <Avatar initials={StuInit(confirmModal)} tint="teal" size={48} />
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:17, fontFamily:'var(--font-display)' }}>
                  {confirmModal.student_first_name||'Student'} {confirmModal.student_last_name||''}
                  {(confirmModal.student_username||confirmModal.student?.username)&&<span style={{ marginLeft:8, fontSize:13, color:'var(--accent)', fontWeight:600 }}>@{confirmModal.student_username||confirmModal.student?.username}</span>}
                </div>
                {(confirmModal.student_email||confirmModal.student?.email)&&<div style={{ color:'var(--text3)', fontSize:12.5, marginTop:1 }}>{confirmModal.student_email||confirmModal.student?.email}</div>}
                <div style={{ color:'var(--text3)', fontSize:13 }}>{confirmModal.module_name||''} · {fmtDate(confirmModal.scheduled_date,{weekday:'short',month:'short',day:'numeric'})} · {to12(confirmModal.start_time||'')}</div>
              </div>
              <span className="chip chip-soft">Request</span>
            </div>
            {/* Questionnaire / prep answers */}
            <div className="card" style={{ padding:14, marginBottom:18, background:'#f8f7ff', border:'1px solid #e8e6fd' }}>
              <div style={{ fontWeight:700, fontSize:12, marginBottom:10, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'.06em' }}>Pre-session questionnaire</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)', marginBottom:2 }}>What do you want to cover?</div>
                  <div style={{ fontSize:13.5, color:'var(--text)', fontWeight:500 }}>{confirmModal.subject||confirmModal.topic||'—'}</div>
                </div>
                {(confirmModal.student_notes||confirmModal.notes)&&(
                  <div style={{ paddingTop:8, borderTop:'1px solid var(--border)' }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)', marginBottom:2 }}>Anything to prepare?</div>
                    <p style={{ fontSize:13.5, color:'var(--text2)', lineHeight:1.5, margin:0 }}>{confirmModal.student_notes||confirmModal.notes}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="field" style={{ marginTop:4 }}>
              <label>Meeting link <span style={{ fontWeight:400, color:'var(--text3)' }}>(optional — you can add it later)</span></label>
              <input className="input" placeholder="https://meet.google.com/…" value={meetingLink} onChange={e=>setMeetingLink(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={()=>handleDecline(confirmModal.id)}>Decline</button>
              <button className="btn btn-primary" style={{ flex:2 }} disabled={confirming} onClick={handleConfirm}>
                {confirming?<><span className="spinner" /> Confirming…</>:<><Check size={17} strokeWidth={2.4} /> Confirm session</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit link & notes modal */}
      {editModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(24,23,31,.42)', backdropFilter:'blur(4px)', display:'grid', placeItems:'center', zIndex:1000, padding:20 }} onMouseDown={()=>setEditModal(null)}>
          <div onMouseDown={e=>e.stopPropagation()} className="card" style={{ width:'100%', maxWidth:480, padding:28, boxShadow:'var(--shadow-lg)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:17, fontFamily:'var(--font-display)' }}>Edit session details</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setEditModal(null)}><X size={16} /></button>
            </div>
            <div style={{ color:'var(--text3)', fontSize:13, marginBottom:18 }}>
              {fmtDate(editModal.scheduled_date,{weekday:'short',month:'short',day:'numeric'})} · {to12(editModal.start_time||'')} · {editModal.subject||'Session'}
            </div>
            <div className="field">
              <label>Meeting link</label>
              <input className="input" placeholder="https://meet.google.com/…" value={editLink} onChange={e=>setEditLink(e.target.value)} />
            </div>
            <div className="field" style={{ marginTop:14 }}>
              <label>Notes for student <span style={{ fontWeight:400, color:'var(--text3)' }}>(visible to the student)</span></label>
              <textarea className="input" rows={3} placeholder="e.g. Please prepare questions, we'll focus on algorithm design…" value={editNotes} onChange={e=>setEditNotes(e.target.value)} style={{ resize:'vertical', minHeight:80 }} />
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={()=>setEditModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2 }} disabled={editSaving} onClick={handleSaveLink}>
                {editSaving?<><span className="spinner" /> Saving…</>:<><Save size={15} /> Save changes</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Courses ─────────────────────────────────────────────────────
function TutorCoursesPage({ courses }) {
  const navigate = useNavigate()
  const [open, setOpen]   = useState(null)
  const [tab,  setTab]    = useState('students')
  const [materials, setMaterials] = useState([])
  const [matLoading, setMatLoading] = useState(false)

  const openCourse = id => { setOpen(id); setTab('students'); setMaterials([]) }

  const loadMaterials = (moduleId) => {
    if (!moduleId) return
    setMatLoading(true)
    api.get(`/modules/${moduleId}/materials`)
      .then(r => setMaterials(r.data.data?.materials || []))
      .catch(() => {})
      .finally(() => setMatLoading(false))
  }

  if (open) {
    const c   = courses.find(x => x.id === open)
    const idx = courses.findIndex(x => x.id === open)

    // When switching to materials tab, load them
    const handleTabChange = (t) => {
      setTab(t)
      if (t === 'materials' && materials.length === 0 && !matLoading) {
        loadMaterials(c?.id)
      }
    }

    return (
      <div>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom:14, paddingLeft:0 }} onClick={() => setOpen(null)}><ArrowLeft size={16} /> All courses</button>
        <div className="card" style={{ padding:22, display:'flex', gap:16, alignItems:'center', marginBottom:22 }}>
          <ModTile mono={monoOf(c?.name||'')} tint={tintOf(idx)} size={56} />
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:20, fontFamily:'var(--font-display)' }}>{c?.name}</div>
            <div style={{ color:'var(--text3)', fontSize:13.5 }}>{c?.students||0} students · {c?.category||''}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--border)', marginBottom:22 }}>
          {[['students','Students',User],['materials','My Materials',Folder]].map(([k,l,Ic])=>(
            <button key={k} onClick={()=>handleTabChange(k)} className={`tab-btn${tab===k ? ' active' : ''}`} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Ic size={16} />{l}
            </button>
          ))}
        </div>

        {tab === 'students' && (
          (c?.students_list||[]).length > 0 ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
              {c.students_list.map((s,i) => (
                <div key={s.id} className="card" style={{ padding:16, display:'flex', alignItems:'center', gap:14 }}>
                  <Avatar initials={(s.first_name?.[0]||'')+(s.last_name?.[0]||'S')} tint={tintOf(i)} size={42} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14.5 }}>{s.first_name} {s.last_name}</div>
                    {s.email && <div style={{ color:'var(--text3)', fontSize:12 }}>{s.email}</div>}
                  </div>
                  {s.credits_remaining != null && (
                    <span style={{ fontSize:12, color:'var(--text3)', fontFamily:'var(--font-display)', fontWeight:600 }}>{s.credits_remaining} cr</span>
                  )}
                  <button className="btn btn-outline btn-sm" style={{ display:'flex', alignItems:'center', gap:5 }}
                    onClick={() => navigate('/tutor/chat', { state: { openUserId: s.id, openUserName: `${s.first_name} ${s.last_name}` } })}>
                    <MessageSquare size={14} /> Chat
                  </button>
                </div>
              ))}
            </div>
          ) : <EmptyState text="No students enrolled in this module yet." />
        )}

        {tab === 'materials' && (
          matLoading
            ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><span className="spinner" role="status" aria-label="Loading" style={{ width:20, height:20 }} /></div>
            : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {materials.filter(m => m.type === 'tutor' || m.type === 'all').map(m => (
                  <div key={m.id} className="card" style={{ padding:16, display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:'var(--accent-light)', color:'var(--accent)', display:'grid', placeItems:'center', flexShrink:0 }}>
                      <FileText size={22} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14.5 }}>{m.title}</div>
                      <div style={{ color:'var(--text3)', fontSize:12.5, marginTop:2 }}>
                        {m.file_type && <span className="chip chip-line" style={{ padding:'0px 7px', fontSize:11, marginRight:6 }}>{m.file_type}</span>}
                        {m.description || ''}
                      </div>
                    </div>
                    <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <ExternalLink size={14} /> Open
                    </a>
                  </div>
                ))}
                {materials.filter(m => m.type === 'tutor' || m.type === 'all').length === 0 && (
                  <EmptyState text="No tutor materials for this module yet. Ask admin to upload them." />
                )}
              </div>
            )
        )}
      </div>
    )
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }} className="tc-grid">
      {courses.map((c,i) => (
        <button key={c.id} onClick={() => openCourse(c.id)} className="card" style={{ padding:20, textAlign:'left', cursor:'pointer', border:'none', outline:'inherit' }}
          onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='var(--shadow-md)' }}
          onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}>
          <ModTile mono={monoOf(c.name||'')} tint={tintOf(i)} size={48} />
          <div style={{ fontWeight:700, fontSize:16, fontFamily:'var(--font-display)', marginTop:14 }}>{c.name}</div>
          <div style={{ color:'var(--text3)', fontSize:13, marginTop:4 }}>{c.students||0} students enrolled</div>
          <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ color:'var(--text3)', fontSize:12.5 }}>{c.pending_requests||0} pending requests</span>
            <ChevronRight size={16} style={{ color:'var(--text3)' }} />
          </div>
        </button>
      ))}
      {courses.length===0 && <div style={{ gridColumn:'1/-1' }}><EmptyState text="No assigned courses yet." /></div>}
    </div>
  )
}

// ── Payroll ──────────────────────────────────────────────────────
function TutorPayrollPage() {
  const [weeks, setWeeks]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState('weeks')
  const [openWeek, setOpenWeek]         = useState(null)
  const [receiptModal, setReceiptModal] = useState(null)
  const [fromDate, setFromDate]         = useState('')
  const [toDate, setToDate]             = useState('')

  useEffect(() => {
    api.get('/tutors/me/payroll/my-weeks')
      .then(r => setWeeks(r.data.data?.weeks || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const fmtCents = c => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtWeekRange = (start, end) => {
    const a = new Date(start), b = new Date(end)
    const f = (d, y) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) })
    return `${f(a)} – ${f(b, true)}`
  }

  const filteredWeeks = weeks.filter(w => {
    const wStart = new Date(w.weekStart), wEnd = new Date(w.weekEnd)
    if (fromDate && wEnd < new Date(fromDate)) return false
    if (toDate   && wStart > new Date(toDate)) return false
    return true
  })
  const hasFilter = fromDate || toDate

  const paidWeeks    = filteredWeeks.filter(w => w.payment?.status === 'PAID')
  const totalPaid    = paidWeeks.reduce((s, w) => s + (w.payment?.totalPayCents ?? w.totalPayCents), 0)
  const totalPending = filteredWeeks.filter(w => w.payment?.status === 'PENDING').reduce((s, w) => s + w.totalPayCents, 0)
  const totalUnpaid  = filteredWeeks.filter(w => !w.payment).reduce((s, w) => s + w.totalPayCents, 0)

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width:26, height:26 }} /></div>

  return (
    <>
      {/* Date range filter */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 14px' }}>
          <span style={{ fontSize:12.5, fontWeight:600, color:'var(--text3)', whiteSpace:'nowrap' }}>From</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ border:'none', background:'transparent', fontSize:13, fontFamily:'inherit', color:'var(--text)', outline:'none', cursor:'pointer' }} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 14px' }}>
          <span style={{ fontSize:12.5, fontWeight:600, color:'var(--text3)', whiteSpace:'nowrap' }}>To</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ border:'none', background:'transparent', fontSize:13, fontFamily:'inherit', color:'var(--text)', outline:'none', cursor:'pointer' }} />
        </div>
        {hasFilter && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>
            <X size={13} /> Clear
          </button>
        )}
        {hasFilter && (
          <span style={{ fontSize:12.5, color:'var(--text3)', marginLeft:'auto' }}>
            Showing {filteredWeeks.length} of {weeks.length} week{weeks.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:22 }}>
        {[
          { label:'Paid out', value:fmtCents(totalPaid),    icon:Check,       tint:'teal' },
          { label:'Pending',  value:fmtCents(totalPending), icon:Clock,       tint:'amber' },
          { label:'Unpaid',   value:fmtCents(totalUnpaid),  icon:DollarSign,  tint:'violet' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:18, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:TINTS[s.tint].bg, color:TINTS[s.tint].fg, display:'grid', placeItems:'center', flexShrink:0 }}>
              <s.icon size={22} />
            </div>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:22, letterSpacing:'-0.03em', lineHeight:1 }}>{s.value}</div>
              <div style={{ fontSize:13, fontWeight:600, marginTop:4, color:'var(--text2)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:18, borderBottom:'2px solid var(--border)', paddingBottom:0 }}>
        {[['weeks','Weekly Breakdown'],['history','Payment History']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding:'8px 16px', fontWeight:600, fontSize:13.5, fontFamily:'inherit', background:'none', border:'none', cursor:'pointer', borderBottom: tab===id ? '2px solid var(--accent)' : '2px solid transparent', marginBottom:'-2px', color: tab===id ? 'var(--accent)' : 'var(--text3)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Payment History tab */}
      {tab === 'history' && (
        <div>
          {paidWeeks.length === 0
            ? <EmptyState text={hasFilter ? 'No confirmed payments in this date range.' : 'No confirmed payments yet. Payments appear here once an admin marks them as done.'} />
            : (
              <div className="card" style={{ padding:0, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'var(--bg2)' }}>
                      {['Week','Sessions','Session Pay','Base Pay','Total','Ref #','Confirmed'].map(h => (
                        <th key={h} style={{ padding:'9px 14px', fontSize:10.5, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', textAlign:'left', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paidWeeks.map((week, i) => {
                      const p = week.payment
                      return (
                        <tr key={week.weekStart} style={{ borderTop: i>0 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding:'10px 14px', fontSize:13, fontWeight:600, whiteSpace:'nowrap' }}>{fmtWeekRange(week.weekStart, week.weekEnd)}</td>
                          <td style={{ padding:'10px 14px', fontSize:13, color:'var(--text2)', textAlign:'center' }}>{p?.sessionsCompleted ?? week.sessionCount}</td>
                          <td style={{ padding:'10px 14px', fontSize:13, color:'var(--text2)' }}>{fmtCents(p?.sessionPayCents ?? week.sessionPayCents)}</td>
                          <td style={{ padding:'10px 14px', fontSize:13, color:'var(--text2)' }}>{fmtCents(p?.basePayCents ?? week.basePayCents)}</td>
                          <td style={{ padding:'10px 14px', fontSize:13.5, fontWeight:700, fontFamily:'var(--font-display)', color:'#0f9b8e' }}>{fmtCents(p?.totalPayCents ?? week.totalPayCents)}</td>
                          <td style={{ padding:'10px 14px', fontSize:12.5, color:'var(--text3)', fontFamily:'monospace' }}>{p?.referenceNumber || <span style={{ color:'var(--text3)', fontStyle:'italic', fontFamily:'inherit' }}>—</span>}</td>
                          <td style={{ padding:'10px 14px', fontSize:12, color:'var(--text3)', whiteSpace:'nowrap' }}>{p?.approvedAt ? fmtDate(p.approvedAt, { month:'short', day:'numeric', year:'numeric' }) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* Weekly accordion */}
      {tab === 'weeks' && <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {filteredWeeks.map(week => {
          const wk = new Date(week.weekStart).toISOString().slice(0, 10)
          const isOpen = openWeek === wk
          const { payment } = week
          const paid    = payment?.status === 'PAID'
          const pending = payment?.status === 'PENDING'
          return (
            <div key={wk} className="card" style={{ padding:0, overflow:'hidden' }}>
              {/* Card header */}
              <button
                onClick={() => setOpenWeek(isOpen ? null : wk)}
                style={{ width:'100%', padding:'14px 18px', display:'flex', alignItems:'center', gap:16, textAlign:'left', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}
              >
                <div style={{ width:44, height:44, borderRadius:12, background:paid?'#e1f5f1':pending?'#fbf0db':'var(--bg2)', color:paid?'#0f9b8e':pending?'#d98a1f':'var(--text3)', display:'grid', placeItems:'center', flexShrink:0 }}>
                  {paid ? <Check size={22} strokeWidth={2.4} /> : pending ? <Clock size={22} /> : <DollarSign size={22} />}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15, fontFamily:'var(--font-display)' }}>{fmtWeekRange(week.weekStart, week.weekEnd)}</div>
                  <div style={{ color:'var(--text3)', fontSize:12.5, marginTop:2 }}>
                    {week.sessionCount} session{week.sessionCount !== 1 ? 's' : ''} · {fmtCents(week.totalPayCents)} total
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:20, letterSpacing:'-0.02em' }}>{fmtCents(week.totalPayCents)}</div>
                  <span className={paid ? 'chip chip-good' : pending ? 'chip chip-soft' : 'chip'} style={{ fontSize:11, marginTop:4, display:'inline-block' }}>
                    {paid ? 'Paid' : pending ? 'Pending' : 'Not submitted'}
                  </span>
                </div>
                <ChevronRight size={17} style={{ color:'var(--text3)', transform:isOpen?'rotate(90deg)':'none', transition:'transform .2s', flexShrink:0 }} />
              </button>

              {/* Expanded body */}
              {isOpen && (
                <div style={{ borderTop:'1px solid var(--border)', padding:'16px 18px 18px' }}>
                  {/* Pay breakdown */}
                  <div style={{ background:'var(--bg2)', borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
                    <div style={{ fontSize:12.5, fontWeight:700, marginBottom:10, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'.06em' }}>Pay breakdown</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 24px' }}>
                      {[
                        ['Pay Rate', fmtCents(week.payRateCents) + ' / session'],
                        ['Sessions', String(week.sessionCount)],
                        ['Session Pay', fmtCents(week.sessionPayCents)],
                        ['Weekly Base Pay', fmtCents(week.basePayCents)],
                      ].map(([label, val]) => (
                        <div key={label}>
                          <div style={{ fontSize:11.5, color:'var(--text3)', marginBottom:1 }}>{label}</div>
                          <div style={{ fontSize:14, fontWeight:600 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop:'1px solid var(--border)', marginTop:10, paddingTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontWeight:600, fontSize:13 }}>Total</span>
                      <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:20, letterSpacing:'-0.02em', color:'#0f9b8e' }}>{fmtCents(week.totalPayCents)}</span>
                    </div>
                  </div>

                  {/* Receipt / status actions */}
                  {paid && (
                    <div style={{ marginBottom:16, display:'flex', justifyContent:'flex-end' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setReceiptModal(week)}>
                        <FileText size={13} /> View Receipt
                      </button>
                    </div>
                  )}
                  {!paid && (
                    <div className="card" style={{ padding:'10px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:10, background:'#fbfaf7', borderStyle:'dashed' }}>
                      <Clock size={14} style={{ color:'var(--text3)', flexShrink:0 }} />
                      <span style={{ fontSize:13, color:'var(--text2)' }}>{pending ? 'Payment submitted — awaiting admin confirmation.' : 'Payment has not been submitted yet.'}</span>
                    </div>
                  )}

                  {/* Session list */}
                  {week.sessions.length > 0 && (
                    <>
                      <div style={{ fontSize:12.5, fontWeight:700, marginBottom:8, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'.06em' }}>Sessions</div>
                      <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid var(--border)' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse' }}>
                          <thead>
                            <tr style={{ background:'var(--bg2)' }}>
                              {['Session','Student','Date','Start','Duration'].map(h=>(
                                <th key={h} style={{ padding:'7px 12px', fontSize:10.5, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', textAlign:'left', borderBottom:'1px solid var(--border)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {week.sessions.map((s,si)=>(
                              <tr key={s.id} style={{ borderTop:si>0?'1px solid var(--border)':'none' }}>
                                <td style={{ padding:'9px 12px', fontSize:12.5, fontWeight:500 }}>{s.subject||'Session'}</td>
                                <td style={{ padding:'9px 12px', fontSize:12.5, color:'var(--text2)' }}>{s.studentName}{s.studentUsername&&<span style={{ marginLeft:5, fontSize:11, color:'var(--accent)', fontWeight:600 }}>@{s.studentUsername}</span>}</td>
                                <td style={{ padding:'9px 12px', fontSize:12, color:'var(--text3)' }}>{fmtDate(s.scheduledDate,{month:'short',day:'numeric'})}</td>
                                <td style={{ padding:'9px 12px', fontSize:12, color:'var(--text3)' }}>{s.startTime}</td>
                                <td style={{ padding:'9px 12px', fontSize:12, color:'var(--text3)' }}>{s.durationMinutes} min</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {filteredWeeks.length === 0 && <EmptyState text={hasFilter ? 'No weeks in this date range.' : 'Payroll weeks will appear here after sessions are completed.'} />}
      </div>}

      {/* Receipt modal */}
      {receiptModal && (
        <div onMouseDown={() => setReceiptModal(null)} style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(24,23,31,.42)', backdropFilter:'blur(4px)', display:'grid', placeItems:'center', padding:20 }}>
          <div onMouseDown={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:420, background:'#fff', borderRadius:20, boxShadow:'0 25px 50px -12px rgba(0,0,0,.25)', padding:28 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:18 }}>Payment Receipt</div>
              <button onClick={() => setReceiptModal(null)} style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:'var(--text3)', display:'flex' }}><X size={18} /></button>
            </div>
            {[
              ['Week',               fmtWeekRange(receiptModal.weekStart, receiptModal.weekEnd)],
              ['Sessions Completed', String(receiptModal.payment?.sessionsCompleted ?? receiptModal.sessionCount)],
              ['Pay Rate',           (receiptModal.payment?.payRateCents != null ? fmtCents(receiptModal.payment.payRateCents) : fmtCents(receiptModal.payRateCents)) + ' / session'],
              ['Session Pay',        fmtCents(receiptModal.payment?.sessionPayCents ?? receiptModal.sessionPayCents)],
              ['Base Pay',           fmtCents(receiptModal.payment?.basePayCents ?? receiptModal.basePayCents)],
              ['Total Pay',          fmtCents(receiptModal.payment?.totalPayCents ?? receiptModal.totalPayCents)],
              receiptModal.payment?.approvedAt && ['Paid On', fmtDate(receiptModal.payment.approvedAt)],
            ].filter(Boolean).map(([label, value], i, arr) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', padding:'9px 0', borderBottom:i<arr.length-1?'1px solid var(--border)':'none', gap:14 }}>
                <div style={{ width:140, flexShrink:0, fontSize:13, color:'var(--text3)' }}>{label}</div>
                <div style={{ fontSize:13, fontWeight:600, wordBreak:'break-word' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ── Notifications ────────────────────────────────────────────────
function TutorNotificationsPage() {
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

  const markOne = (id) => {
    api.patch(`/notifications/${id}/read`).catch(() => {})
    setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n))
    setUnread(c => Math.max(0, c - 1))
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width:24, height:24 }} /></div>
  return (
    <>
      {notifs.some(n => !n.read && !n.is_read) && (
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
          <button className="btn btn-outline btn-sm" onClick={markAll}><CheckCheck size={15} /> Mark all read</button>
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {notifs.map((n, i) => {
          const isUnread = !n.read && !n.is_read
          return (
            <div key={n.id||i} className="card" style={{ padding:16, display:'flex', gap:14, alignItems:'flex-start', borderLeft:isUnread?'3px solid var(--accent)':'1px solid var(--border)' }}>
              <div style={{ width:42, height:42, borderRadius:12, background:'var(--accent-light)', color:'var(--accent)', display:'grid', placeItems:'center', flexShrink:0 }}><Bell size={20} /></div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontWeight:700, fontSize:14.5 }}>{n.title}</span>
                  {isUnread && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--danger)', flexShrink:0 }} />}
                </div>
                <p style={{ fontSize:13.5, color:'var(--text2)', lineHeight:1.5, marginTop:4 }}>{n.body||n.message||n.content}</p>
                <div style={{ color:'var(--text3)', fontSize:12, marginTop:6, display:'flex', alignItems:'center', gap:10 }}>
                  <Clock size={12} />
                  {n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : n.time || ''}
                  {isUnread && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize:11, padding:'2px 8px', marginLeft:'auto' }} onClick={() => markOne(n.id)}>
                      <Check size={12} /> Mark read
                    </button>
                  )}
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

// ── Chat ────────────────────────────────────────────────────────
function TutorChatPage({ courses }) {
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

  // Unique students from all courses
  const myStudents = courses
    .flatMap(c => c.students_list || [])
    .reduce((acc, s) => {
      if (!acc.some(x => x.id === s.id)) acc.push(s)
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

  // Auto-open from navigation state (e.g. from "Chat" button on student card)
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
      const r    = await api.get(`/messages/conversations/${id}`)
      const data = r.data.data
      setMessages(data.messages || [])
      const other = data.conversation?.participants?.find(p => p.user_id !== (user?.userId || user?.id))
      setOtherUser(other?.user || null)
    } catch (e) {
      setMessages([])
    } finally { setLoadingConvo(false) }
  }

  const openOrCreateConvo = async (userId, userName) => {
    try {
      const r     = await api.post('/messages/conversations', { user_id: userId })
      const convo = r.data.data?.conversation
      if (convo) {
        loadConversations()
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
    const myId = user?.userId || user?.id
    const optimistic = { id: `tmp-${Date.now()}`, content: text.trim(), sender_id: myId, sent_at: new Date().toISOString() }
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
    <div style={{ display:'flex', gap:20, height:'calc(100vh - 200px)', minHeight:400 }}>
      {/* Left: conversations + quick-start */}
      <div style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column' }}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:14, fontFamily:'var(--font-display)' }}>Messages</div>

        {myStudents.length > 0 && convos.length === 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text3)', marginBottom:10 }}>Your students</div>
            {myStudents.map((s,i) => (
              <button key={s.id} onClick={() => openOrCreateConvo(s.id, `${s.first_name} ${s.last_name}`)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:12, background:'var(--bg2)', border:'none', cursor:'pointer', fontFamily:'inherit', marginBottom:8, transition:'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
                <Avatar initials={(s.first_name?.[0]||'')+(s.last_name?.[0]||'S')} tint={tintOf(i)} size={36} />
                <div style={{ flex:1, minWidth:0, textAlign:'left' }}>
                  <div style={{ fontWeight:600, fontSize:13.5 }}>{s.first_name} {s.last_name}</div>
                  <div style={{ color:'var(--text3)', fontSize:12 }}>Tap to start chatting</div>
                </div>
                <MessageSquare size={15} style={{ color:'var(--text3)' }} />
              </button>
            ))}
          </div>
        )}

        {loadingList
          ? <div style={{ display:'flex', justifyContent:'center', padding:20 }}><span className="spinner" role="status" aria-label="Loading" style={{ width:18, height:18 }} /></div>
          : convos.map(c => {
              const other = c.other_participant
              const init  = `${other?.first_name?.[0]||''}${other?.last_name?.[0]||''}`.toUpperCase() || '?'
              const sel   = activeId === c.id
              return (
                <button key={c.id} onClick={() => openConvo(c.id)} style={{
                  width:'100%', display:'flex', alignItems:'center', gap:12, padding:'12px', borderRadius:12,
                  background:sel?'var(--accent-light)':'transparent', border:'none', cursor:'pointer',
                  fontFamily:'inherit', marginBottom:4, transition:'background .15s', textAlign:'left',
                }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg2)' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}>
                  <Avatar initials={init} tint="teal" size={40} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13.5, color:sel?'var(--accent)':'var(--text)' }}>
                      {other?.first_name} {other?.last_name}
                      {other?.username && <span style={{ marginLeft:5, fontSize:11, color:'var(--accent)', fontWeight:600, opacity:0.8 }}>@{other.username}</span>}
                    </div>
                    {c.last_message && (
                      <div style={{ fontSize:12, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {c.last_message.content}
                      </div>
                    )}
                  </div>
                  {c.unread && <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }} />}
                </button>
              )
            })
        }
        {!loadingList && convos.length === 0 && myStudents.length === 0 && (
          <EmptyState text="No messages yet. Students will appear here once assigned." />
        )}
      </div>

      {/* Divider */}
      <div style={{ width:1, background:'var(--border)', flexShrink:0 }} />

      {/* Right: thread */}
      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
        {!activeId ? (
          <div style={{ flex:1, display:'grid', placeItems:'center', color:'var(--text3)', fontSize:14 }}>
            <div style={{ textAlign:'center' }}>
              <MessageSquare size={40} style={{ margin:'0 auto 12px', opacity:.3 }} />
              <div>Select a conversation to start messaging</div>
            </div>
          </div>
        ) : (
          <>
            {otherUser && (
              <div style={{ padding:'0 0 16px', borderBottom:'1px solid var(--border)', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                <Avatar initials={`${otherUser.first_name?.[0]||''}${otherUser.last_name?.[0]||''}`} tint="teal" size={40} />
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{otherUser.first_name} {otherUser.last_name}{otherUser.username && <span style={{ marginLeft:7, fontSize:12, color:'var(--accent)', fontWeight:600 }}>@{otherUser.username}</span>}</div>
                  <div style={{ color:'var(--text3)', fontSize:12.5, textTransform:'capitalize' }}>{otherUser.role || 'Student'}</div>
                </div>
              </div>
            )}

            <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8, paddingRight:4, marginBottom:16 }}>
              {loadingConvo
                ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><span className="spinner" role="status" aria-label="Loading" style={{ width:20, height:20 }} /></div>
                : messages.length === 0
                ? <div style={{ textAlign:'center', color:'var(--text3)', fontSize:14, paddingTop:40 }}>No messages yet — say hello!</div>
                : messages.map(msg => {
                    const isMe = (msg.sender_id || msg.sender?.id) === myId
                    return (
                      <div key={msg.id} style={{ display:'flex', justifyContent:isMe?'flex-end':'flex-start' }}>
                        <div style={{
                          maxWidth:'72%', padding:'10px 14px',
                          borderRadius:isMe?'18px 18px 4px 18px':'18px 18px 18px 4px',
                          background:isMe?'var(--accent)':'var(--bg2)',
                          color:isMe?'#fff':'var(--text)',
                          fontSize:14, lineHeight:1.5,
                          boxShadow:'0 1px 3px rgba(0,0,0,.08)',
                        }}>
                          {msg.content}
                          <div style={{ fontSize:11, opacity:.65, marginTop:4, textAlign:isMe?'right':'left' }}>
                            {msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }) : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })
              }
              <div ref={bottomRef} />
            </div>

            <div style={{ display:'flex', gap:10, alignItems:'flex-end', paddingTop:12, borderTop:'1px solid var(--border)' }}>
              <textarea
                className="form-input"
                rows={1}
                placeholder="Type a message…"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                style={{ flex:1, resize:'none', borderRadius:12, minHeight:42, maxHeight:120, lineHeight:1.5 }}
              />
              <button className="btn btn-primary" style={{ height:42, padding:'0 16px', flexShrink:0 }}
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

// ── Banking ──────────────────────────────────────────────────────
// ── Payout Receipt Modal ────────────────────────────────────────
function PayoutReceiptModal({ payout, onClose }) {
  if (!payout) return null
  const fmtMethod = m => ({ bank_transfer: 'Bank Transfer', paypal: 'PayPal', check: 'Check', other: 'Other' }[m] || m)
  const fmtDate   = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'
  const shortId   = payout.id?.slice(-8).toUpperCase()

  const rows = [
    ['Amount',       <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: '#0f9b8e' }}>{fmtMoney(payout.amount_cents / 100)}</span>],
    ['Currency',     (payout.currency || 'USD').toUpperCase()],
    ['Method',       fmtMethod(payout.method)],
    payout.reference_number && ['Reference / Transaction ID', <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{payout.reference_number}</span>],
    ['Date Paid',    fmtDate(payout.paid_at)],
    (payout.period_start || payout.period_end) && ['Pay Period', `${fmtDate(payout.period_start)} – ${fmtDate(payout.period_end)}`],
    payout.notes && ['Notes from Admin', <span style={{ fontStyle: 'italic' }}>{payout.notes}</span>],
    ['Processed By', payout.admin ? `${payout.admin.first_name} ${payout.admin.last_name}` : '—'],
    ['Receipt ID',   <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text3)' }}>{shortId}</span>],
  ].filter(Boolean)

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(24,23,31,.45)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,.18)', overflow: 'hidden' }}>
        {/* Receipt header */}
        <div style={{ background: 'linear-gradient(135deg, #0f9b8e 0%, #0d8578 100%)', padding: '24px 24px 20px', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff' }}><X size={15} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.2)', display: 'grid', placeItems: 'center' }}><FileText size={22} color="#fff" /></div>
            <div>
              <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' }}>Payment Receipt</div>
              <div style={{ color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.03em', marginTop: 2 }}>{fmtMoney(payout.amount_cents / 100)}</div>
            </div>
          </div>
        </div>

        {/* Receipt rows */}
        <div style={{ padding: '8px 24px 24px' }}>
          {rows.map(([label, value], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', gap: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text3)', flexShrink: 0 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', wordBreak: 'break-all' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TutorBankingPage() {
  const { user } = useAuth()
  const [banking, setBanking]   = useState(null)
  const [payouts, setPayouts]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [saved,   setSaved]     = useState(false)
  const [receipt, setReceipt]   = useState(null)
  const [form, setForm] = useState({
    account_holder_name: '', bank_name: '', account_number: '',
    routing_number: '', account_type: 'checking', iban: '',
    swift_code: '', paypal_email: '', preferred_method: 'bank_transfer', notes: '',
  })

  useEffect(() => {
    Promise.all([
      api.get('/tutors/me/banking').catch(() => null),
      api.get('/tutors/me/payroll/my-weeks').catch(() => null),
    ]).then(([br, pr]) => {
      const b = br?.data?.data?.banking
      if (b) {
        setBanking(b)
        setForm({
          account_holder_name: b.account_holder_name || '',
          bank_name:           b.bank_name           || '',
          account_number:      b.account_number      || '',
          routing_number:      b.routing_number      || '',
          account_type:        b.account_type        || 'checking',
          iban:                b.iban                || '',
          swift_code:          b.swift_code          || '',
          paypal_email:        b.paypal_email        || '',
          preferred_method:    b.preferred_method    || 'bank_transfer',
          notes:               b.notes               || '',
        })
      }
      const allWeeks = pr?.data?.data?.weeks || []
      setPayouts(allWeeks.filter(w => w.payment?.status === 'PAID'))
    }).finally(() => setLoading(false))
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true); setSaved(false)
    try {
      const r = await api.put('/tutors/me/banking', form)
      setBanking(r.data.data.banking)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save banking details')
    } finally { setSaving(false) }
  }

  const fmtCents = c => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtWeekRange = (start, end) => {
    const a = new Date(start), b = new Date(end)
    const f = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${f(a)} – ${f(b)}`
  }
  const totalPaid = payouts.reduce((s, w) => s + (w.payment?.totalPayCents ?? w.totalPayCents ?? 0), 0)

  if (!user?.approved) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', borderStyle: 'dashed' }}>
        <Landmark size={36} style={{ color: 'var(--text3)', margin: '0 auto 12px' }} />
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Account not yet approved</div>
        <div style={{ color: 'var(--text3)', fontSize: 14 }}>Banking details can be added once your tutor account is approved.</div>
      </div>
    )
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      {/* Payout summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: '#e1f5f1', color: '#0f9b8e', display: 'grid', placeItems: 'center', flexShrink: 0 }}><DollarSign size={20} /></div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.03em' }}>{fmtCents(totalPaid)}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Total received</div>
          </div>
        </div>
        <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: banking?.verified ? '#e1f5f1' : '#fbf0db', color: banking?.verified ? '#0f9b8e' : '#d98a1f', display: 'grid', placeItems: 'center', flexShrink: 0 }}><ShieldCheck size={20} /></div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{banking?.verified ? 'Verified' : 'Unverified'}</div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>{banking?.verified ? `by ${banking.verifier?.first_name} ${banking.verifier?.last_name}` : 'Admin will verify your details'}</div>
          </div>
        </div>
      </div>

      {/* Banking details form */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, marginBottom: 20 }}>Payment details</div>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Preferred method */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Preferred payment method</label>
            <select value={form.preferred_method} onChange={e => setForm(f => ({ ...f, preferred_method: e.target.value }))} className="input" style={{ width: '100%' }}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="paypal">PayPal</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Account holder name <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input required value={form.account_holder_name} onChange={e => setForm(f => ({ ...f, account_holder_name: e.target.value }))} className="input" style={{ width: '100%' }} placeholder="Full legal name" />
          </div>

          {form.preferred_method === 'paypal' ? (
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>PayPal email</label>
              <input type="email" value={form.paypal_email} onChange={e => setForm(f => ({ ...f, paypal_email: e.target.value }))} className="input" style={{ width: '100%' }} placeholder="paypal@example.com" />
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Bank name</label>
                  <input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} className="input" style={{ width: '100%' }} placeholder="e.g. Chase" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Account type</label>
                  <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))} className="input" style={{ width: '100%' }}>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Account number</label>
                  <input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} className="input" style={{ width: '100%' }} placeholder="•••• •••• 1234" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Routing number</label>
                  <input value={form.routing_number} onChange={e => setForm(f => ({ ...f, routing_number: e.target.value }))} className="input" style={{ width: '100%' }} placeholder="9-digit routing number" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>IBAN (international)</label>
                  <input value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} className="input" style={{ width: '100%' }} placeholder="GB00 BARC 2000 5512 3456 78" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>SWIFT / BIC code</label>
                  <input value={form.swift_code} onChange={e => setForm(f => ({ ...f, swift_code: e.target.value }))} className="input" style={{ width: '100%' }} placeholder="BARCGB22" />
                </div>
              </div>
            </>
          )}

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Notes for admin</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" rows={2} style={{ width: '100%', resize: 'vertical' }} placeholder="Any additional payment instructions" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={15} />}
              {saving ? 'Saving…' : 'Save details'}
            </button>
            {saved && <span style={{ color: '#0f9b8e', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 5 }}><Check size={15} /> Saved</span>}
          </div>
        </form>
      </div>

      {/* Payment records */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Payment records</div>
        {payouts.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 14, padding: '20px 0', borderTop: '1px solid var(--border)' }}>No payments recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {payouts.map((w, i) => {
              const p = w.payment
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#e1f5f1', color: '#0f9b8e', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Check size={18} strokeWidth={2.4} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: '#0f9b8e' }}>{fmtCents(p.totalPayCents ?? w.totalPayCents)}</span>
                      {p.referenceNumber && (
                        <span style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--bg2)', padding: '2px 8px', borderRadius: 5, color: 'var(--text2)' }}>{p.referenceNumber}</span>
                      )}
                    </div>
                    <div style={{ color: 'var(--text3)', fontSize: 12.5, marginTop: 3 }}>
                      {fmtWeekRange(w.weekStart, w.weekEnd)} · {w.sessionCount} session{w.sessionCount !== 1 ? 's' : ''}
                    </div>
                    {p.notes && (
                      <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes}</div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {p.approvedAt ? new Date(p.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setReceipt(w)}>
                      <FileText size={13} /> Receipt
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Receipt modal */}
      {receipt && (() => {
        const p = receipt.payment
        const rows = [
          ['Week',          fmtWeekRange(receipt.weekStart, receipt.weekEnd)],
          ['Sessions',      String(p.sessionsCompleted ?? receipt.sessionCount)],
          ['Pay rate',      fmtCents(receipt.payRateCents) + ' / session'],
          ['Session pay',   fmtCents(p.sessionPayCents ?? receipt.sessionPayCents)],
          ['Base pay',      fmtCents(p.basePayCents ?? receipt.basePayCents)],
          ['Total',         fmtCents(p.totalPayCents ?? receipt.totalPayCents)],
          p.referenceNumber && ['Reference #',  p.referenceNumber],
          p.approvedAt      && ['Paid on',       new Date(p.approvedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
          p.notes           && ['Notes',         p.notes],
        ].filter(Boolean)
        return (
          <div onMouseDown={() => setReceipt(null)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(24,23,31,.42)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20 }}>
            <div onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 20, boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Payment Receipt</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 2 }}>{fmtWeekRange(receipt.weekStart, receipt.weekEnd)}</div>
                </div>
                <button onClick={() => setReceipt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text3)', display: 'flex', borderRadius: 8 }}><X size={18} /></button>
              </div>
              {/* Amount hero */}
              <div style={{ padding: '20px 24px', textAlign: 'center', background: '#f0fdf4', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Amount paid</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 36, letterSpacing: '-0.03em', color: '#0f9b8e' }}>{fmtCents(p.totalPayCents ?? receipt.totalPayCents)}</div>
              </div>
              {/* Detail rows */}
              <div style={{ padding: '8px 24px 20px' }}>
                {rows.map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text3)', flexShrink: 0, marginRight: 16 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', fontFamily: label === 'Reference #' ? 'monospace' : 'inherit' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Settings ─────────────────────────────────────────────────────
function TutorSettingsPage() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:680 }}>
      <ChangePasswordCard />
    </div>
  )
}



// ── Main export ─────────────────────────────────────────────────
export default function TutorDashboard() {
  usePageTitle('Tutor Dashboard')
  const { user } = useAuth()
  const location  = useLocation()
  const navigate  = useNavigate()
  const [sessions, setSessions] = useState([])
  const [courses,  setCourses]  = useState([])
  const [loading,  setLoading]  = useState(true)

  const load = () => {
    Promise.all([
      api.get('/sessions/my').catch(()=>({data:{data:{sessions:[]}}})),
      api.get('/enrollments/teaching').catch(()=>({data:{data:{courses:[]}}})),
    ]).then(([sr,cr])=>{
      setSessions(sr.data.data?.sessions||[])
      setCourses(cr.data.data?.courses||cr.data.data?.modules||[])
    }).finally(()=>setLoading(false))
  }
  useEffect(()=>{ load() },[])

  // Real-time session updates
  useEffect(() => {
    const s = getSocket()
    const refresh = () => load()
    s.on('session:new',     refresh)
    s.on('session:updated', refresh)
    return () => { s.off('session:new', refresh); s.off('session:updated', refresh) }
  }, [])

  const pending  = sessions.filter(s=>s.status==='pending'||s.status==='requested').length
  const upcomingC= sessions.filter(s=>s.status==='confirmed'||s.status==='upcoming').length

  const path = location.pathname
  let title='', subtitle=''
  if(path.startsWith('/tutor/courses'))       { title='Courses';       subtitle='Modules you\'re assigned to mentor.' }
  else if(path.startsWith('/tutor/calendar')) { title='My Calendar';   subtitle='Set your weekly availability and mark busy times.' }
  else if(path.startsWith('/tutor/payroll'))  { title='Payroll';       subtitle='Your weekly pay breakdown and payment history.' }
  else if(path.startsWith('/tutor/banking'))  { title='Banking';       subtitle='Your payment details for receiving payouts.' }
  else if(path.startsWith('/tutor/chat'))     { title='Messages';      subtitle='Chat directly with your students.' }
  else if(path.startsWith('/tutor/notif'))    { title='Notifications'; subtitle='Session alerts and admin messages.' }
  else if(path.startsWith('/tutor/settings')) { title='Settings';      subtitle='Manage your account security.' }
  else { title=`Hi ${user?.first_name||'there'}`; subtitle=`You have ${pending} requests waiting and ${upcomingC} confirmed sessions ahead.` }

  return (
    <>
    <TutorShell active="meetings" title={title} subtitle={subtitle} stats={{ pending, upcoming:upcomingC }}
      headRight={path==='/tutor'&&!path.includes('/notif')&&(
        <span className="chip chip-line" style={{ padding:'8px 14px', display:'flex', alignItems:'center', gap:6 }}>
          <Star size={15} fill="var(--credit)" strokeWidth={0} /> Tutor
        </span>
      )}>
      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width:28, height:28 }} /></div> : (
        <Routes>
          <Route index element={<TutorMeetingsPage sessions={sessions} onRefresh={load} />} />
          <Route path="courses"         element={<TutorCoursesPage courses={courses} />} />
          <Route path="calendar"        element={<TutorCalendarPage />} />
          <Route path="payroll"         element={<TutorPayrollPage />} />
          <Route path="banking"         element={<TutorBankingPage />} />
          <Route path="chat/*"          element={<TutorChatPage courses={courses} />} />
          <Route path="notifications"   element={<TutorNotificationsPage />} />
          <Route path="settings"        element={<TutorSettingsPage />} />
        </Routes>
      )}
    </TutorShell>

    <HelpChatWidget />
    </>
  )
}
