import { confirmDialog } from '../../components/ConfirmDialog'
import { toast } from '../../services/toast'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import {
  LayoutGrid, Users, GraduationCap, Layers, CreditCard, DollarSign,
  FileText, Bell, HelpCircle, LifeBuoy, TrendingUp, LogOut, Shield,
  ChevronRight, Search, ArrowLeft, Check, X, Plus, Minus, Star, Calendar,
  Send, AlertCircle, BookOpen, Receipt, ClipboardList, Megaphone,
  Package, Tag, Trash2, Link as LinkIcon, GraduationCap as GradCap,
  MessageCircle, Clock, UserCheck, Landmark, ShieldCheck, Eye, EyeOff,
  Download, BadgeCheck, CalendarCheck, Ban, RotateCcw,
  Database, Table2, Key, Link2, ChevronDown, RefreshCw, ArrowRight,
  Award, ThumbsUp, ThumbsDown, Mail
} from 'lucide-react'
import AdminDataExplorer from './DataExplorer'
import CalendarComponent from '../../components/Calendar'
import { getSocket } from '../../services/socket'
import { PaymentReceiptModal } from '../student/Dashboard'
import usePageTitle from '../../utils/usePageTitle'
import useTabParam from '../../utils/useTabParam'

// ── Helpers ────────────────────────────────────────────────────
const TINTS = {
  indigo: { bg: '#ecebfd', fg: 'var(--accent)' },
  violet: { bg: '#efeaff', fg: '#7c5cff' },
  blue:   { bg: '#e7effe', fg: '#2563eb' },
  teal:   { bg: '#e1f5f1', fg: '#0f9b8e' },
  amber:  { bg: '#fbf0db', fg: '#d98a1f' },
  red:    { bg: '#fdecea', fg: '#dc2626' },
}
const TINT_KEYS = ['indigo', 'violet', 'blue', 'teal', 'amber', 'violet', 'indigo', 'blue']
const tintOf  = i => TINT_KEYS[i % TINT_KEYS.length]
const monoOf  = (n = '') => (n.match(/\b[A-Z]/g) || []).join('').slice(0, 2).toUpperCase() || n.slice(0, 2).toUpperCase()
const initOf  = u => `${u?.first_name?.[0] || ''}${u?.last_name?.[0] || ''}`.toUpperCase() || '?'
const fmtMoney = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })
const fmtDate  = (iso, opts) => {
  if (!iso) return ''
  return new Date(iso + (String(iso).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' })
}
const weekLabel = iso => {
  const a = new Date(iso + 'T00:00:00'), b = new Date(a)
  b.setDate(a.getDate() + 6)
  const f = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${f(a)} – ${f(b)}`
}

// ── Shared atoms ───────────────────────────────────────────────
function Avatar({ initials, tint = 'indigo', size = 38 }) {
  const c = TINTS[tint] || TINTS.indigo
  return <div style={{ width: size, height: size, borderRadius: '50%', background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: size * .38, flexShrink: 0, letterSpacing: '-0.02em' }}>{initials}</div>
}
function ModTile({ mono, tint = 'indigo', size = 44 }) {
  const c = TINTS[tint] || TINTS.indigo
  return <div style={{ width: size, height: size, borderRadius: size * .28, background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * .36, flexShrink: 0, letterSpacing: '-0.03em' }}>{mono}</div>
}
function StarRating({ value = 5, size = 12, showNum = false, count }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-flex', gap: 1.5 }}>
        {[0,1,2,3,4].map(i => <Star key={i} size={size} fill={i < Math.round(value) ? 'var(--credit)' : 'none'} strokeWidth={1.6} style={{ color: i < Math.round(value) ? 'var(--credit)' : 'var(--border)' }} />)}
      </span>
      {showNum && <span style={{ fontSize: size * .92, fontWeight: 700, color: 'var(--text)' }}>{Number(value).toFixed(1)}{count != null && <span style={{ color: 'var(--text3)', fontWeight: 500 }}> ({count})</span>}</span>}
    </span>
  )
}
function StatCard({ label, value, icon: Icon, tint = 'indigo', sub, money }) {
  const c = TINTS[tint] || TINTS.indigo
  return (
    <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={21} /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 25, letterSpacing: '-0.03em', lineHeight: 1 }}>{money ? fmtMoney(value) : value}</div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{label}</div>
        {sub && <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}
function SegTabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, background: 'var(--bg2)', padding: 4, borderRadius: 999, width: 'fit-content', flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{ height: 36, padding: '0 16px', borderRadius: 999, fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, background: value === t.id ? '#fff' : 'transparent', color: value === t.id ? 'var(--text)' : 'var(--text2)', boxShadow: value === t.id ? 'var(--shadow-xs)' : 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          {t.label}{t.count != null && <span style={{ fontSize: 12, padding: '1px 7px', borderRadius: 999, background: value === t.id ? 'var(--accent-light)' : 'var(--border)', color: value === t.id ? 'var(--accent)' : 'var(--text2)', fontWeight: 700 }}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
function EmptyState({ text }) {
  return <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text3)', fontSize: 14, borderStyle: 'dashed' }}>{text}</div>
}
function Modal({ open, onClose, children, width = 520 }) {
  useEffect(() => {
    if (!open) return
    const fn = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', fn)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', fn); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(24,23,31,.42)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20, animation: 'fadeIn .2s ease both' }}>
      <div onMouseDown={e => e.stopPropagation()} className="scroll" style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 22, boxShadow: 'var(--shadow-lg)', padding: 28 }}>
        {children}
      </div>
    </div>
  )
}

// ── Logo ────────────────────────────────────────────────────────
function Logo({ onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none"><path d="M16 1.5 19.4 12.6 30.5 16 19.4 19.4 16 30.5 12.6 19.4 1.5 16 12.6 12.6Z" fill="var(--accent)"/><path d="M16 8.5 17.7 14.3 23.5 16 17.7 17.7 16 23.5 14.3 17.7 8.5 16 14.3 14.3Z" fill="white" opacity=".82"/></svg>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.03em', color: 'var(--text)' }}>Career<span style={{ color: 'var(--accent)' }}>Launch</span></span>
    </div>
  )
}

// ── Admin Shell ─────────────────────────────────────────────────
function AdminShell({ children, title, subtitle, headRight, supportCount = 0 }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = initOf(user)

  const NAV = [
    { id: 'overview',        label: 'Overview',          icon: LayoutGrid,    path: '/admin',                exact: true  },
    { head: 'Operations' },
    { id: 'courses',         label: 'Courses',            icon: Layers,        path: '/admin/modules',         exact: false },
    { id: 'manage-modules',  label: 'Manage Modules',     icon: Package,       path: '/admin/manage-modules',  exact: false },
    { id: 'manage-plans',    label: 'Manage Plans',       icon: Tag,           path: '/admin/manage-plans',    exact: false },
    { id: 'students',        label: 'Students',           icon: GraduationCap,  path: '/admin/students',        exact: false },
    { id: 'tutors',          label: 'Tutors',             icon: Users,          path: '/admin/tutors',         exact: false },
    { id: 'sessions',        label: 'Sessions',           icon: CalendarCheck,  path: '/admin/sessions',       exact: false },
    { id: 'certifications',  label: 'Certifications',     icon: Award,          path: '/admin/certifications', exact: false },
    { head: 'Finance' },
    { id: 'payments',        label: 'Student Payments',   icon: CreditCard,    path: '/admin/payments',       exact: false },
    { id: 'payroll',         label: 'Tutor Payroll',      icon: DollarSign,    path: '/admin/payroll',        exact: false },
    { id: 'logbook',         label: 'Admin Logbook',      icon: ClipboardList, path: '/admin/logbook',        exact: false },
    { head: 'Comms' },
    { id: 'support',         label: 'Support',            icon: LifeBuoy,      path: '/admin/support',        exact: false, badge: supportCount || null },
    { id: 'help-chat',       label: 'Help Chat',          icon: MessageCircle, path: '/admin/help-chat',      exact: false },
    { id: 'faqs',            label: 'FAQs',               icon: HelpCircle,    path: '/admin/faqs',           exact: false },
    { id: 'broadcast',       label: 'Notifications',      icon: Megaphone,     path: '/admin/notify',         exact: false },
    { id: 'email-templates', label: 'Email Templates',    icon: Mail,          path: '/admin/email-templates', exact: false },
    { head: 'Insights' },
    { id: 'analytics',       label: 'Analytics',          icon: TrendingUp,    path: '/admin/analytics',      exact: false },
    { id: 'schema',          label: 'DB Schema',          icon: Database,      path: '/admin/schema',         exact: false },
    { id: 'data-explorer',   label: 'Data Explorer',      icon: Table2,        path: '/admin/data-explorer',  exact: false },
  ]

  const handleLogout = async () => { await logout(); navigate('/') }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <aside style={{ width: 252, flexShrink: 0, background: '#fff', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '20px 20px 14px' }}>
          <Logo onClick={() => navigate('/')} />
          <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px 4px 8px', borderRadius: 999, background: '#ecebfd', color: 'var(--accent)', fontSize: 12, fontWeight: 700, letterSpacing: '.02em' }}>
            <Shield size={14} /> Admin portal
          </div>
        </div>
        <div style={{ padding: '2px 12px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto', flex: 1 }}>
          {NAV.map((n, i) => {
            if (n.head) return <div key={i} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3)', padding: '12px 12px 4px' }}>{n.head}</div>
            const on = n.exact ? location.pathname === '/admin' : location.pathname.startsWith(n.path)
            return (
              <button key={n.id} onClick={() => navigate(n.path)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 12px', borderRadius: 11, textAlign: 'left', background: on ? 'var(--accent-light)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text2)', fontWeight: on ? 700 : 600, fontSize: 13.5, position: 'relative', transition: 'background .12s', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--bg2)' }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                <n.icon size={17} strokeWidth={on ? 2 : 1.8} />
                <span style={{ flex: 1 }}>{n.label}</span>
                {n.badge && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--danger)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{n.badge}</span>}
              </button>
            )
          })}
        </div>
        <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
            <Avatar initials={initials} tint="indigo" size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.first_name} {user?.last_name}</div>
              {user?.username && <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 600 }}>@{user.username}</div>}
              <div style={{ color: 'var(--text3)', fontSize: 11 }}>Administrator</div>
            </div>
            <button onClick={handleLogout} style={{ padding: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0 }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(246,245,241,.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '0 32px', height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 22, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>{title}</h1>
              {subtitle && <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 1 }}>{subtitle}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {headRight}
              <span className="chip chip-line" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}><Shield size={14} style={{ color: 'var(--accent)' }} /> Full access</span>
              <Avatar initials={initials} tint="indigo" size={40} />
            </div>
          </div>
        </header>
        <div style={{ padding: '28px 32px 64px', maxWidth: 1160, margin: '0 auto' }}>
          {children}
        </div>
      </main>
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────────
function Overview() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.get('/admin/stats').then(r => setStats(r.data.data)).catch(() => setStats({})).finally(() => setLoading(false)) }, [])
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 28, height: 28 }} /></div>
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }} className="adm-stat">
        <StatCard label="Net revenue" value={stats?.total_revenue || 0} money icon={TrendingUp} tint="teal" sub="all time" />
        <StatCard label="Active students" value={stats?.total_students || 0} icon={GraduationCap} tint="indigo" sub={`${stats?.total_enrollments || 0} enrollments`} />
        <StatCard label="Sessions total" value={stats?.total_sessions || 0} icon={Calendar} tint="violet" sub="all modules" />
        <StatCard label="Active tutors" value={stats?.total_tutors || 0} icon={Users} tint="amber" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }} className="adm-over">
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, fontFamily: 'var(--font-display)' }}>Recent enrollments</div>
          <div style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>Latest plan purchases</div>
          {(stats?.recent_enrollments || []).map((e, i) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: i < (stats.recent_enrollments.length - 1) ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar initials={initOf(e.student)} tint="indigo" size={32} />
                <div>
                  <button onClick={() => navigate(`/admin/students?open=${e.student?.id}`)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit', textAlign: 'left' }}>
                    {e.student?.first_name} {e.student?.last_name}
                  </button>
                  <div style={{ color: 'var(--text3)', fontSize: 12 }}>{e.course?.title || ''}</div>
                </div>
              </div>
              <span className="chip chip-good">{e.status || 'Active'}</span>
            </div>
          ))}
          {!(stats?.recent_enrollments?.length) && <EmptyState text="No enrollments yet." />}
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14, fontFamily: 'var(--font-display)' }}>Needs your attention</div>
          {[
            { t: `${stats?.open_tickets || 0} open support tickets`,      ic: LifeBuoy,      path: '/admin/support',   tint: 'amber' },
            { t: `${stats?.unpaid_sessions || 0} sessions awaiting payout`, ic: DollarSign,  path: '/admin/payroll',   tint: 'violet' },
            { t: `${stats?.total_students || 0} students on platform`,     ic: GraduationCap, path: '/admin/students', tint: 'indigo' },
          ].map((r, i) => (
            <button key={i} onClick={() => navigate(r.path)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, background: 'var(--bg2)', marginBottom: 10, border: 'none', cursor: 'pointer', transition: 'background .15s', fontFamily: 'inherit' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: TINTS[r.tint].bg, color: TINTS[r.tint].fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><r.ic size={18} /></div>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, textAlign: 'left' }}>{r.t}</span>
              <ChevronRight size={16} style={{ color: 'var(--text3)' }} />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Module Materials Panel ──────────────────────────────────────
function ModuleMaterialsPanel({ moduleId, docType }) {
  const [materials, setMaterials] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [adding,    setAdding]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form, setForm] = useState({ title: '', url: '', description: '', file_type: '' })

  const load = () => {
    setLoading(true)
    api.get(`/modules/${moduleId}/materials`)
      .then(r => {
        const all = r.data.data?.materials || []
        setMaterials(all.filter(m => m.type === docType || m.type === 'all'))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (moduleId) load() }, [moduleId, docType])

  const handleAdd = async () => {
    if (!form.title.trim() || !form.url.trim()) return
    setSaving(true)
    try {
      await api.post(`/modules/${moduleId}/materials`, {
        title:       form.title.trim(),
        url:         form.url.trim(),
        description: form.description.trim() || undefined,
        file_type:   form.file_type.trim()   || undefined,
        type:        docType,
      })
      setForm({ title: '', url: '', description: '', file_type: '' })
      setAdding(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to add document')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!(await confirmDialog('Delete this document?'))) return
    await api.delete(`/modules/${moduleId}/materials/${id}`).catch(console.error)
    load()
  }

  const docLabel = docType === 'student' ? 'student' : 'tutor'

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 20, height: 20 }} /></div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text3)' }}>
          Documents visible to <strong>{docLabel}s</strong> enrolled in this module
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Add document
        </button>
      </div>

      {adding && (
        <div className="card" style={{ padding: 20, marginBottom: 18, background: 'var(--bg2)', border: '1.5px solid var(--accent)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Add {docLabel} document</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Title <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" placeholder="e.g. Session 1 Notes" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} autoFocus />
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Document URL <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" placeholder="https://drive.google.com/…" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} />
            </div>
            <div className="field">
              <label>File type</label>
              <select className="select" value={form.file_type} onChange={e => setForm(p => ({ ...p, file_type: e.target.value }))}>
                <option value="">Select…</option>
                <option value="pdf">PDF</option>
                <option value="doc">Word / Doc</option>
                <option value="video">Video</option>
                <option value="spreadsheet">Spreadsheet</option>
                <option value="slides">Slides</option>
                <option value="link">Link / URL</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Description (optional)</label>
              <input className="input" placeholder="Short note about this file" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setAdding(false); setForm({ title: '', url: '', description: '', file_type: '' }) }}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 2 }} disabled={!form.title.trim() || !form.url.trim() || saving} onClick={handleAdd}>
              {saving ? <><span className="spinner" /> Saving…</> : <><Check size={15} /> Save document</>}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {materials.map((m, i) => (
          <div key={m.id} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <FileText size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.title}</div>
              <div style={{ color: 'var(--text3)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {m.file_type && <span className="chip chip-line" style={{ padding: '0px 7px', fontSize: 11 }}>{m.file_type}</span>}
                {m.description && <span>{m.description}</span>}
              </div>
            </div>
            <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <LinkIcon size={14} /> Open
            </a>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '0 8px' }} onClick={() => handleDelete(m.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {materials.length === 0 && !adding && (
          <EmptyState text={`No ${docLabel} documents yet. Click 'Add document' to upload one.`} />
        )}
      </div>
    </div>
  )
}

// ── Courses (Modules) ─────────────────────────────────────────
function AdminCourses() {
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)

  const load = () => api.get('/admin/modules').then(r => setModules(r.data.data?.modules || [])).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  if (open) return <CourseDetail mod={modules.find(m => m.id === open)} idx={modules.findIndex(m => m.id === open)} onBack={() => setOpen(null)} onUpdated={load} />

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }} className="ac-grid">
      {modules.map((m, i) => (
        <button key={m.id} onClick={() => setOpen(m.id)} className="card" style={{ padding: 20, textAlign: 'left', cursor: 'pointer', border: 'none', outline: 'inherit', transition: 'transform .15s, box-shadow .15s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <ModTile mono={monoOf(m.name)} tint={tintOf(i)} size={44} />
            {m.credit_cost != null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'var(--credit-bg)', color: 'var(--credit)', border: '1px solid var(--credit-line)' }}>
                <Star size={11} fill="var(--credit)" strokeWidth={0} />{m.credit_cost}
              </span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: 15.5, fontFamily: 'var(--font-display)', marginBottom: 4 }}>{m.name}</div>
          <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>{m.category || ''} · {m.status}</div>
        </button>
      ))}
      {!loading && modules.length === 0 && <div style={{ gridColumn: '1/-1' }}><EmptyState text="No modules configured yet. Create one in Manage Modules." /></div>}
    </div>
  )
}

function CourseDetail({ mod, idx, onBack, onUpdated }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('about')
  const [tutors, setTutors] = useState([])
  const [allTutors, setAllTutors] = useState([])
  const [selectedTutorId, setSelectedTutorId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState({
    name:              mod?.name              || '',
    category:          mod?.category          || '',
    credit_cost:       mod?.credit_cost       ?? 1,
    short_description: mod?.short_description || '',
    full_description:  mod?.full_description  || '',
    status:            mod?.status            || 'unpublished',
    visibility:        mod?.visibility        || 'hidden',
  })

  useEffect(() => {
    if (!mod) return
    api.get(`/admin/modules/${mod.id}/tutors`).then(r => setTutors(r.data.data?.tutors || [])).catch(() => {})
    api.get('/admin/users?role=tutor').then(r => setAllTutors(r.data.data?.users || [])).catch(() => {})
  }, [mod?.id])

  const assignTutor = async () => {
    if (!selectedTutorId) return
    setAssigning(true)
    try {
      const r = await api.post(`/admin/modules/${mod.id}/tutors`, { tutor_id: selectedTutorId })
      const t = r.data.data?.record?.tutor
      if (t) setTutors(p => p.some(x => x.id === t.id) ? p : [...p, t])
      setSelectedTutorId('')
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to assign tutor') }
    finally { setAssigning(false) }
  }

  if (!mod) return null
  const tint = tintOf(idx || 0)
  const mono = monoOf(fields.name || mod.name)

  const saveFields = async () => {
    setSaving(true)
    try {
      await api.put(`/admin/manage/modules/${mod.id}`, {
        name:              fields.name.trim(),
        category:          fields.category,
        credit_cost:       Number(fields.credit_cost) || 1,
        short_description: fields.short_description,
        full_description:  fields.full_description,
        status:            fields.status,
        visibility:        fields.visibility,
      })
      onUpdated?.()
    } catch(e) { toast.error(e.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, paddingLeft: 0 }} onClick={onBack}><ArrowLeft size={16} /> All courses</button>
      <div className="card" style={{ padding: 22, display: 'flex', gap: 16, alignItems: 'center', marginBottom: 22 }}>
        <ModTile mono={mono} tint={tint} size={56} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 20, fontFamily: 'var(--font-display)' }}>{fields.name || mod.name}</div>
          <div style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: 2 }}>{fields.category || ''} · {fields.credit_cost} credit / session</div>
        </div>
        <span className={`chip ${fields.status === 'published' ? 'chip-good' : 'chip-soft'}`}>{fields.status || 'draft'}</span>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 22, flexWrap: 'wrap' }}>
        {[['about','About & Edit'],['student-docs','Student Docs'],['tutor-docs','Tutor Docs'],['tutors','Tutors']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={`tab-btn${tab === k ? ' active' : ''}`}>{l}</button>
        ))}
      </div>

      {tab === 'about' && (
        <div className="card" style={{ padding: 22, maxWidth: 660 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Module name</label>
              <input className="input" value={fields.name} onChange={e => setFields(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="field">
              <label>Category</label>
              <input className="input" value={fields.category} onChange={e => setFields(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Career Materials" />
            </div>
            <div className="field">
              <label>Credits per session</label>
              <input className="input" type="number" min={1} max={10} value={fields.credit_cost} onChange={e => setFields(p => ({ ...p, credit_cost: e.target.value }))} />
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Short description (shown on landing page cards)</label>
              <textarea className="form-input" rows={2} value={fields.short_description} onChange={e => setFields(p => ({ ...p, short_description: e.target.value }))} style={{ resize: 'vertical' }} />
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Full description (shown on module detail page)</label>
              <textarea className="form-input" rows={4} value={fields.full_description} onChange={e => setFields(p => ({ ...p, full_description: e.target.value }))} style={{ resize: 'vertical' }} />
            </div>
            <div className="field">
              <label>Status</label>
              <select className="select" value={fields.status} onChange={e => setFields(p => ({ ...p, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="unpublished">Unpublished</option>
                <option value="published">Published (visible on landing)</option>
              </select>
            </div>
            <div className="field">
              <label>Visibility</label>
              <select className="select" value={fields.visibility} onChange={e => setFields(p => ({ ...p, visibility: e.target.value }))}>
                <option value="hidden">Hidden</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 18 }} onClick={saveFields} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving…</> : <><Check size={15} /> Save changes</>}
          </button>
        </div>
      )}

      {(tab === 'student-docs' || tab === 'tutor-docs') && (
        <ModuleMaterialsPanel moduleId={mod.id} docType={tab === 'student-docs' ? 'student' : 'tutor'} />
      )}

      {tab === 'tutors' && (
        <div>
          {/* Assign tutor row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center' }}>
            <select
              className="select"
              value={selectedTutorId}
              onChange={e => setSelectedTutorId(e.target.value)}
              style={{ flex: 1, maxWidth: 340 }}>
              <option value="">Select a tutor to assign…</option>
              {allTutors
                .filter(t => !tutors.some(a => a.id === t.id))
                .map(t => (
                  <option key={t.id} value={t.id}>{t.first_name} {t.last_name} — {t.email}</option>
                ))}
            </select>
            <button
              className="btn btn-primary btn-sm"
              disabled={!selectedTutorId || assigning}
              onClick={assignTutor}>
              {assigning ? <><span className="spinner" /> Assigning…</> : <><Plus size={15} /> Assign tutor</>}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
            {tutors.map((t, i) => (
              <div key={t.id} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar initials={initOf(t)} tint={tintOf(i)} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button onClick={() => navigate(`/admin/tutors?open=${t.id}`)} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit', textAlign: 'left' }}>
                    {t.first_name} {t.last_name}
                  </button>
                  <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>{t.email}</div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={async () => {
                  if (!(await confirmDialog('Remove this tutor from the module?'))) return
                  await api.delete(`/admin/modules/${mod.id}/tutors/${t.id}`).catch(console.error)
                  setTutors(p => p.filter(x => x.id !== t.id))
                }}>Remove</button>
              </div>
            ))}
          </div>
          {tutors.length === 0 && <EmptyState text="No tutors assigned to this module yet." />}
        </div>
      )}
    </div>
  )
}

// ── Students ────────────────────────────────────────────────────
function AdminStudents() {
  const location = useLocation()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState(null)
  const [bulkCreditModal, setBulkCreditModal] = useState(null)
  const [assignTutorModal, setAssignTutorModal] = useState(null)
  const [receiptPayment, setReceiptPayment] = useState(null)
  const [suspendGate, setSuspendGate] = useState(null)  // { student, suspend }
  const [suspending, setSuspending] = useState(false)

  const openFullReceipt = async (p) => {
    try {
      const r = await api.get(`/admin/payments/${p.id}`)
      setReceiptPayment(r.data.data?.payment || p)
    } catch { setReceiptPayment(p) }
  }

  useEffect(() => { api.get('/admin/users?role=student').then(r => setUsers(r.data.data?.users || [])).catch(() => {}).finally(() => setLoading(false)) }, [])

  const openDetail = async (u) => {
    const r = await api.get(`/admin/students/${u.id}`).catch(() => null)
    setDetail(r?.data?.data || { student: u, payments: [], sessions: [], module_enrollments: [] })
  }

  const toggleSuspend = async (reason) => {
    if (!suspendGate) return
    setSuspending(true)
    try {
      await api.patch(`/admin/users/${suspendGate.student.id}/suspend`, { suspended: suspendGate.suspend, reason })
      toast.success(suspendGate.suspend ? 'Account suspended' : 'Account reactivated')
      setUsers(p => p.map(u => u.id === suspendGate.student.id ? { ...u, suspended: suspendGate.suspend } : u))
      setSuspendGate(null)
      openDetail(suspendGate.student)
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setSuspending(false) }
  }

  // Auto-open detail if ?open=<id> is in the URL
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('open')
    if (id && users.length > 0 && !detail) {
      const u = users.find(x => x.id === id)
      if (u) openDetail(u)
    }
  }, [location.search, users])

  const list = users.filter(u => `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()))

  if (detail) {
    const { student, payments, sessions, module_enrollments } = detail
    const totalSpent = payments.filter(p => p.status === 'succeeded').reduce((s, p) => s + (p.amount_cents || 0) / 100, 0)
    const init = initOf(student)
    return (
      <div>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, paddingLeft: 0 }} onClick={() => setDetail(null)}><ArrowLeft size={16} /> All students</button>
        <div className="card" style={{ padding: 22, display: 'flex', gap: 18, alignItems: 'center', marginBottom: 20 }}>
          <Avatar initials={init} tint="teal" size={60} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 20, fontFamily: 'var(--font-display)' }}>{student.first_name} {student.last_name}</span>
              {student.username && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>@{student.username}</span>}
              {student.suspended && <span className="chip chip-alert" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ban size={12} /> Suspended</span>}
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>{student.email} · joined {fmtDate(student.created_at)}</div>
            {student.suspended && student.suspended_reason && (
              <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 4 }}>Reason: {student.suspended_reason}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 22, textAlign: 'center', alignItems: 'center' }}>
            <div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24 }}>{sessions.length}</div><div style={{ color: 'var(--text3)', fontSize: 12 }}>sessions</div></div>
            <div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24 }}>{fmtMoney(totalSpent)}</div><div style={{ color: 'var(--text3)', fontSize: 12 }}>spent</div></div>
            {student.suspended ? (
              <button className="btn btn-outline btn-sm" onClick={() => setSuspendGate({ student, suspend: false })}>
                <RotateCcw size={14} /> Reactivate
              </button>
            ) : (
              <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setSuspendGate({ student, suspend: true })}>
                <Ban size={14} /> Suspend
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'start' }} className="as-detail">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>Credit balance by module</h3>
              {module_enrollments.length > 0 && (
                <button className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setBulkCreditModal({ student, module_enrollments })}>
                  <Minus size={13} /><Plus size={13} /> Adjust Credits
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {module_enrollments.map((e, i) => {
                const granted   = e.credit?.credits_granted ?? 5
                const used      = e.credit?.credits_used    ?? 0
                const remaining = granted - used
                return (
                  <div key={e.id} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <ModTile mono={monoOf(e.module?.name || e.module?.title || '')} tint={tintOf(i)} size={38} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{e.module?.name || e.module?.title || 'Module'}</div>
                      <div style={{ color: 'var(--text3)', fontSize: 12 }}>
                        {remaining} of {granted} credits left
                        {e.tutor
                          ? <span style={{ marginLeft: 8 }}>· <button onClick={() => navigate(`/admin/tutors?open=${e.tutor.id}`)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--success)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>{e.tutor.first_name} {e.tutor.last_name}</button></span>
                          : <span style={{ marginLeft: 8, color: 'var(--warning)' }}>· No tutor</span>}
                      </div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'var(--credit-bg)', color: 'var(--credit)', border: '1px solid var(--credit-line)' }}>
                      <Star size={11} fill="var(--credit)" strokeWidth={0} />{remaining}
                    </span>
                    <button className="btn btn-outline btn-sm" onClick={() => setAssignTutorModal({ student, enrollment: e })}>
                      {e.tutor ? 'Change tutor' : 'Assign tutor'}
                    </button>
                  </div>
                )
              })}
              {module_enrollments.length === 0 && <EmptyState text="No module enrollments yet." />}
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 12, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Payment history</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {payments.map(p => (
                <div key={p.id} className="card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{p.managed_plan?.name || p.plan?.plan_type || 'Plan'}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, textDecoration: p.status === 'refunded' ? 'line-through' : 'none', color: p.status === 'refunded' ? 'var(--text3)' : 'var(--text)' }}>
                      {fmtMoney((p.amount_cents || 0) / 100)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {fmtDate(p.created_at, { month: 'short', day: 'numeric' })}
                      {p.receipt_number && <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text2)', fontSize: 11 }}>{p.receipt_number}</span>}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`chip ${p.status === 'succeeded' ? 'chip-good' : p.status === 'refunded' ? 'chip-alert' : 'chip-soft'}`}>{p.status}</span>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => openFullReceipt(p)}>
                        <Receipt size={11} /> Receipt
                      </button>
                    </span>
                  </div>
                </div>
              ))}
              {payments.length === 0 && <EmptyState text="No payments yet." />}
            </div>
          </div>
        </div>
        {/* Sessions by module */}
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Sessions by module</h3>
          {(() => {
            if (!sessions.length) return <EmptyState text="No sessions yet." />
            const grouped = sessions.reduce((acc, s) => {
              const key = s.module?.id || '__none__'
              if (!acc[key]) acc[key] = { module: s.module, items: [] }
              acc[key].items.push(s)
              return acc
            }, {})
            const statusChip = st => {
              const map = { completed: 'chip-good', confirmed: 'chip-line', pending: 'chip-soft', cancelled: 'chip-alert' }
              return <span className={`chip ${map[st] || 'chip-soft'}`} style={{ fontSize: 11 }}>{st}</span>
            }
            return Object.values(grouped).map((g, gi) => (
              <div key={gi} className="card" style={{ marginBottom: 14, overflow: 'hidden', padding: 0 }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ModTile mono={monoOf(g.module?.name || 'GEN')} tint={tintOf(gi)} size={30} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{g.module?.name || 'General / No module'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{g.items.length} session{g.items.length !== 1 ? 's' : ''}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    {['Date', 'Time', 'Duration', 'Tutor', 'Status'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {g.items.map((s, si) => (
                      <tr key={s.id} style={{ borderTop: si > 0 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '9px 14px', fontSize: 13 }}>{fmtDate(s.scheduled_date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text3)' }}>{s.start_time}–{s.end_time}</td>
                        <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text3)' }}>{s.duration_minutes ? `${s.duration_minutes} min` : '—'}</td>
                        <td style={{ padding: '9px 14px', fontSize: 13 }}>
                          {s.tutor?.id
                            ? <div><button onClick={() => navigate(`/admin/tutors?open=${s.tutor.id}`)} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 600, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 13 }}>{s.tutor.first_name} {s.tutor.last_name}</button>{s.tutor.username && <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>@{s.tutor.username}</div>}</div>
                            : <span style={{ color: 'var(--text3)' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 14px' }}>{statusChip(s.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          })()}
        </div>

        <BulkCreditModal modal={bulkCreditModal} onClose={() => setBulkCreditModal(null)} onSaved={() => openDetail(student)} />
        <AssignTutorModal modal={assignTutorModal} onClose={() => setAssignTutorModal(null)} onSaved={() => openDetail(student)} />
        <PaymentReceiptModal payment={receiptPayment} onClose={() => setReceiptPayment(null)} />
        <EmailGateModal
          open={!!suspendGate}
          title={suspendGate?.suspend ? `Suspend ${suspendGate?.student?.first_name || 'student'}?` : `Reactivate ${suspendGate?.student?.first_name || 'student'}?`}
          description={suspendGate?.suspend
            ? `${suspendGate?.student?.first_name} ${suspendGate?.student?.last_name} will be signed out and unable to log in until the account is reactivated.`
            : `${suspendGate?.student?.first_name} ${suspendGate?.student?.last_name} will be able to log in and use the platform again immediately.`}
          confirmLabel={suspendGate?.suspend ? 'Suspend account' : 'Reactivate account'}
          danger={!!suspendGate?.suspend}
          reasonLabel={suspendGate?.suspend ? 'Reason for suspension' : undefined}
          loading={suspending}
          onConfirm={toggleSuspend}
          onClose={() => setSuspendGate(null)}
        />
      </div>
    )
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
  return (
    <>
      <div style={{ position: 'relative', maxWidth: 320, marginBottom: 18 }}>
        <Search size={16} style={{ position: 'absolute', left: 13, top: 13, color: 'var(--text3)', pointerEvents: 'none' }} />
        <input className="input" placeholder="Search students…" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 38 }} />
      </div>
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Student', 'Email', 'Plan', 'Joined', ''].map((h, i) => <th key={i} style={{ padding: '12px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'left', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {list.map((u, i) => (
              <tr key={u.id} onClick={() => openDetail(u)} style={{ cursor: 'pointer', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '12px 18px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar initials={initOf(u)} tint={tintOf(i)} size={34} /><div><div style={{ fontWeight: 600, fontSize: 14 }}>{u.first_name} {u.last_name}{u.suspended && <span className="chip chip-alert" style={{ fontSize: 11, marginLeft: 6 }}>Suspended</span>}</div>{u.username && <div style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 600 }}>@{u.username}</div>}</div></div></td>
                <td style={{ padding: '12px 18px', color: 'var(--text3)', fontSize: 13 }}>{u.email}</td>
                <td style={{ padding: '12px 18px' }}>{u.plan_name && <span className="chip chip-line">{u.plan_name}</span>}</td>
                <td style={{ padding: '12px 18px', color: 'var(--text3)', fontSize: 13 }}>{fmtDate(u.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td style={{ padding: '12px 18px', textAlign: 'right' }}><ChevronRight size={16} style={{ color: 'var(--text3)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>No students found.</div>}
      </div>
    </>
  )
}

function BulkCreditModal({ modal, onClose, onSaved }) {
  const { user } = useAuth()
  const [deltas, setDeltas] = useState({})  // { [module_id]: number }
  const [reason, setReason] = useState('')
  const [email, setEmail]   = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  useEffect(() => {
    if (modal) { setDeltas({}); setReason(''); setEmail(''); setErr('') }
  }, [modal])

  if (!modal) return null
  const { student, module_enrollments } = modal
  const emailOk = email.trim().toLowerCase() === (user?.email || '').toLowerCase()

  const setDelta = (moduleId, val) => setDeltas(prev => ({ ...prev, [moduleId]: val }))

  const changes = module_enrollments.filter(e => (deltas[e.module_id] || 0) !== 0)
  const hasChanges = changes.length > 0

  const apply = async () => {
    setErr('')
    if (!reason.trim()) { setErr('A reason is required.'); return }
    if (!emailOk) { setErr('Email does not match your admin account.'); return }

    setSaving(true)
    const errors = []
    for (const e of changes) {
      const delta = deltas[e.module_id]
      const action = delta > 0 ? 'add' : 'deduct'
      const amount = Math.abs(delta)
      try {
        await api.post(`/admin/students/${student.id}/modules/${e.module_id}/credits`, { action, amount, reason })
      } catch (ex) {
        errors.push(`${e.module?.name || 'Module'}: ${ex.response?.data?.error || 'Failed'}`)
      }
    }
    setSaving(false)
    if (errors.length > 0) { setErr(errors.join('\n')); return }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={!!modal} onClose={onClose} width={520}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 19, fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>Adjust credits</h2>
        <button onClick={onClose} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', borderRadius: 8 }}><X size={17} /></button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>{student.first_name} {student.last_name} — set how many credits to add or deduct per module, then apply.</p>

      {/* Per-module rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        {module_enrollments.map((e, i) => {
          const granted   = e.credit?.credits_granted ?? 0
          const used      = e.credit?.credits_used    ?? 0
          const remaining = granted - used
          const delta     = deltas[e.module_id] || 0
          const newVal    = remaining + delta
          const overDeduct = delta < 0 && Math.abs(delta) > remaining

          return (
            <div key={e.module_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${delta !== 0 ? (overDeduct ? '#fca5a5' : 'var(--accent)') : 'var(--border)'}`, background: delta !== 0 ? (overDeduct ? '#fef2f2' : 'var(--accent-light)') : 'var(--bg2)' }}>
              <ModTile mono={monoOf(e.module?.name || '')} tint={tintOf(i)} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.module?.name || 'Module'}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                  {remaining} remaining
                  {delta !== 0 && (
                    <span style={{ marginLeft: 6, fontWeight: 700, color: overDeduct ? 'var(--danger)' : delta > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      → {newVal} {overDeduct && '⚠ exceeds balance'}
                    </span>
                  )}
                </div>
              </div>
              {/* Stepper */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button onClick={() => setDelta(e.module_id, delta - 1)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, display: 'grid', placeItems: 'center' }}>−</button>
                <div style={{ minWidth: 44, textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text3)' }}>
                  {delta > 0 ? `+${delta}` : delta === 0 ? '0' : delta}
                </div>
                <button onClick={() => setDelta(e.module_id, delta + 1)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, display: 'grid', placeItems: 'center' }}>+</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary of changes */}
      {hasChanges && (
        <div style={{ marginBottom: 18, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Changes to apply:</div>
          {changes.map(e => {
            const d = deltas[e.module_id]
            return (
              <div key={e.module_id} style={{ display: 'flex', justifyContent: 'space-between', color: d > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                <span>{e.module?.name || 'Module'}</span>
                <span>{d > 0 ? `+${d}` : d} credits</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="field" style={{ marginBottom: 14 }}>
        <label>Reason <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span> <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(logged to Admin Logbook)</span></label>
        <input className="input" placeholder="e.g. Courtesy credit for cancelled session" value={reason} onChange={e => setReason(e.target.value)} />
      </div>

      <div className="field" style={{ marginBottom: 6 }}>
        <label>Confirm your admin email <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span></label>
        <input className="input" type="email" placeholder={user?.email || 'your@email.com'} value={email} onChange={e => setEmail(e.target.value)} />
        {email && !emailOk && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>Email doesn't match your admin account.</div>}
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 10, whiteSpace: 'pre-line' }}>{err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, marginBottom: 16, padding: '10px 12px', background: 'var(--warning-bg)', borderRadius: 10, fontSize: 12.5, color: 'var(--warning)' }}>
        <Shield size={14} /> Each change is individually logged to the Admin Logbook with your name and reason.
      </div>

      <button
        className="btn btn-primary btn-full btn-lg"
        disabled={!hasChanges || !reason.trim() || !emailOk || saving || changes.some(e => { const d = deltas[e.module_id]; return d < 0 && Math.abs(d) > (e.credit?.credits_granted - e.credit?.credits_used || 0) })}
        onClick={apply}
      >
        {saving ? <><span className="spinner" /> Applying…</> : `Apply ${changes.length} adjustment${changes.length !== 1 ? 's' : ''}`}
      </button>
    </Modal>
  )
}

function AssignTutorModal({ modal, onClose, onSaved }) {
  const [tutors, setTutors] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!modal) return
    setSelectedId('')
    api.get('/admin/users?role=tutor').then(r => setTutors(r.data.data?.users || [])).catch(() => {})
  }, [modal])

  if (!modal) return null
  const { enrollment, student } = modal

  const assign = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await api.post(`/admin/module-enrollments/${enrollment.id}/assign-tutor`, { tutor_id: selectedId })
      onSaved?.()
      onClose()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to assign tutor') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={!!modal} onClose={onClose} width={460}>
      <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Assign tutor</h2>
      <p style={{ fontSize: 13.5, color: 'var(--text3)', marginTop: 4 }}>
        {student.first_name} {student.last_name} · {enrollment.module?.title || 'Module'}
      </p>
      {enrollment.tutor && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 10, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={14} style={{ color: 'var(--success)' }} />
          Currently assigned: <b>{enrollment.tutor.first_name} {enrollment.tutor.last_name}</b>
        </div>
      )}
      <div className="field" style={{ marginTop: 18 }}>
        <label>Select tutor</label>
        <select className="select" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          <option value="">Choose a tutor…</option>
          {tutors.map(t => (
            <option key={t.id} value={t.id}>{t.first_name} {t.last_name} — {t.email}</option>
          ))}
        </select>
      </div>
      <button className="btn btn-primary btn-full btn-lg" style={{ marginTop: 18 }} disabled={!selectedId || saving} onClick={assign}>
        {saving ? <><span className="spinner" /> Assigning…</> : 'Assign tutor'}
      </button>
    </Modal>
  )
}

// ── RecordPayoutModal ──────────────────────────────────────────
// prefill: { amount, period_start, period_end }  — optional pre-filled values
// sessionIds: string[] — if set, also marks these sessions as paid after recording
function RecordPayoutModal({ tutor, onClose, onSaved, prefill, sessionIds }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    amount:           prefill?.amount       || '',
    currency:         'usd',
    method:           'bank_transfer',
    reference_number: '',
    notes:            prefill?.notes        || '',
    period_start:     prefill?.period_start || '',
    period_end:       prefill?.period_end   || '',
    paid_at:          '',
  })
  const [saving, setSaving]   = useState(false)
  const [email, setEmail]     = useState('')
  const emailOk = email.trim().toLowerCase() === (user?.email || '').toLowerCase()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!emailOk) return
    const amount_cents = Math.round(parseFloat(form.amount) * 100)
    if (!amount_cents || amount_cents <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      const r = await api.post(`/admin/tutors/${tutor.id}/payouts`, {
        amount_cents,
        currency:         form.currency,
        method:           form.method,
        reference_number: form.reference_number || null,
        notes:            form.notes            || null,
        period_start:     form.period_start     || null,
        period_end:       form.period_end        || null,
        paid_at:          form.paid_at           || null,
      })
      // Also mark the linked sessions as paid if provided
      if (sessionIds?.length) {
        await api.post('/admin/payroll/pay', { tutor_id: tutor.id, session_ids: sessionIds }).catch(() => {})
      }
      onSaved?.(r.data.data.payout)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record payout')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} width={480}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Record payment</div>
        <button onClick={onClose} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', borderRadius: 8 }}><X size={18} /></button>
      </div>
      <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 10, fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <span>Paying: <b>{tutor.first_name} {tutor.last_name}</b></span>
        {sessionIds?.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {sessionIds.length} session{sessionIds.length !== 1 ? 's' : ''} will be marked paid
          </span>
        )}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Amount <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="input" style={{ width: '100%' }} placeholder="0.00" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Currency</label>
            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="input" style={{ width: '100%' }}>
              <option value="usd">USD</option>
              <option value="gbp">GBP</option>
              <option value="eur">EUR</option>
            </select>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Payment method</label>
          <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} className="input" style={{ width: '100%' }}>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="paypal">PayPal</option>
            <option value="check">Check</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Reference / transaction ID</label>
          <input value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} className="input" style={{ width: '100%' }} placeholder="e.g. TXN-20240601-001" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Period start</label>
            <input type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} className="input" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Period end</label>
            <input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} className="input" style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Date paid</label>
          <input type="date" value={form.paid_at} onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))} className="input" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" rows={2} style={{ width: '100%', resize: 'vertical' }} placeholder="Optional payment notes" />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Confirm your admin email to authorize</label>
          <input className="input" style={{ width: '100%' }} placeholder={user?.email || 'your@email.com'} value={email} onChange={e => setEmail(e.target.value)} />
          {email && !emailOk && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>Email doesn't match your admin account.</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !emailOk} style={{ flex: 1 }}>
            {saving ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Recording…</> : <><Check size={14} /> Record payment</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── PayoutReceiptModal ─────────────────────────────────────────
function PayoutReceiptModal({ payout, onClose }) {
  if (!payout) return null
  const fmtMethod = m => ({ bank_transfer:'Bank Transfer', paypal:'PayPal', check:'Check', other:'Other' }[m] || m)
  const fmtCents  = c => '$' + (c / 100).toFixed(2)
  return (
    <Modal open onClose={onClose} width={440}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Payment receipt</div>
        <button onClick={onClose} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', borderRadius: 8 }}><X size={18} /></button>
      </div>
      <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, marginBottom: 16, textAlign: 'center' }}>
        <div style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 4 }}>Amount paid</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, letterSpacing: '-0.04em' }}>{fmtCents(payout.amount_cents)}</div>
        <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>{payout.currency?.toUpperCase()}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          ['Tutor',      `${payout.tutor?.first_name || ''} ${payout.tutor?.last_name || ''}`],
          ['Method',     fmtMethod(payout.method)],
          ['Date paid',  new Date(payout.paid_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
          payout.reference_number ? ['Reference',  payout.reference_number] : null,
          payout.period_start     ? ['Period',     `${new Date(payout.period_start).toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${new Date(payout.period_end).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`] : null,
          payout.notes            ? ['Notes',      payout.notes] : null,
          ['Recorded by', `${payout.admin?.first_name || ''} ${payout.admin?.last_name || ''}`],
          ['Receipt ID',  payout.id],
        ].filter(Boolean).map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text3)', fontWeight: 600 }}>{label}</span>
            <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: 260, wordBreak: 'break-word', fontFamily: label === 'Receipt ID' ? 'monospace' : 'inherit', fontSize: label === 'Receipt ID' ? 11 : 13.5 }}>{val}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── EmailGateModal ─────────────────────────────────────────────
// Generic email-confirmation modal for important/irreversible actions.
function EmailGateModal({ open, title, description, confirmLabel = 'Confirm', danger = false, onConfirm, onClose, loading: extLoading, reasonLabel }) {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) { setEmail(''); setReason('') } }, [open])
  if (!open) return null
  const emailOk = email.trim().toLowerCase() === (user?.email || '').toLowerCase()
  const btnStyle = {
    flex: 2, height: 44, borderRadius: 999,
    background: danger ? 'var(--danger)' : 'var(--accent)',
    color: '#fff', fontWeight: 700, border: 'none',
    cursor: (!emailOk || extLoading) ? 'not-allowed' : 'pointer',
    opacity: (!emailOk || extLoading) ? 0.5 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit',
  }
  return (
    <Modal open onClose={onClose} width={440}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: danger ? 'var(--danger-bg, #fef2f2)' : 'var(--accent-light)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <AlertCircle size={22} style={{ color: danger ? 'var(--danger)' : 'var(--accent)' }} />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>{title}</div>
      </div>
      {description && <p style={{ fontSize: 13.5, color: 'var(--text3)', marginBottom: 18, lineHeight: 1.55 }}>{description}</p>}
      {reasonLabel && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>{reasonLabel}</label>
          <textarea className="input" rows={2} placeholder="Optional — visible in the audit log" value={reason} onChange={e => setReason(e.target.value)} style={{ resize: 'vertical', minHeight: 56 }} />
        </div>
      )}
      <div className="field">
        <label>Confirm your admin email to authorize</label>
        <input className="input" placeholder={user?.email || 'your@email.com'} value={email} onChange={e => setEmail(e.target.value)} autoFocus />
      </div>
      {email && !emailOk && <div style={{ fontSize: 12.5, color: 'var(--danger)', marginTop: 6 }}>Email doesn't match your admin account.</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button style={btnStyle} disabled={!emailOk || extLoading} onClick={() => onConfirm(reason.trim() || null)}>
          {extLoading ? <><span className="spinner" /> Working…</> : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

// ── AdminWeekPayModal ───────────────────────────────────────────
// existingPaymentId: if set, only calls mark-as-done. Otherwise creates then marks done.
function AdminWeekPayModal({ tutor, week, existingPaymentId, onClose, onSaved }) {
  const { user } = useAuth()
  const [form, setForm] = useState({ email: '', reference: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const emailOk = form.email.trim().toLowerCase() === (user?.email || '').toLowerCase()

  const fmtCents   = c => '$' + (Number(c || 0) / 100).toFixed(2)
  const fmtWeekRange = (s, e) => {
    const a = new Date(s), b = new Date(e)
    const f = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${f(a)} – ${f(b)}`
  }

  const handle = async () => {
    if (!emailOk) return
    setSaving(true)
    try {
      let paymentId = existingPaymentId
      if (!paymentId) {
        const weekKey = new Date(week.weekStart).toISOString().slice(0, 10)
        const r = await api.post('/admin/payroll/pay/weekly', { tutorId: tutor.id, weekStart: weekKey })
        paymentId = r.data.data.payment.id
      }
      await api.patch(`/admin/payroll/activity/${paymentId}/done`, {
        confirmedByEmail: form.email.trim(),
        referenceNumber:  form.reference.trim() || null,
        notes:            form.notes.trim()     || null,
      })
      toast.success('Payment recorded')
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record payment')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} width={460}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 16 }}>
        {existingPaymentId ? 'Mark as paid' : 'Record payment'}
      </div>
      <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '12px 16px', marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 4 }}>Paying <b style={{ color: 'var(--text)' }}>{tutor.first_name} {tutor.last_name}</b></div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{fmtWeekRange(week.weekStart, week.weekEnd)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12 }}>
          {[
            ['Sessions', week.sessionCount],
            ['Session pay', fmtCents(week.sessionPayCents)],
            ['Base pay', fmtCents(week.basePayCents)],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Total</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: '#0f9b8e' }}>{fmtCents(week.totalPayCents)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Reference / check number</label>
          <input className="input" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="e.g. CHK-20240601-001" />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Notes <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
          <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} placeholder="Optional payment notes" />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Confirm your admin email to authorize <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input className="input" placeholder={user?.email || 'your@email.com'} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          {form.email && !emailOk && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>Email doesn't match your admin account.</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 2 }} disabled={!emailOk || saving} onClick={handle}>
          {saving ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Working…</> : <><Check size={14} /> {existingPaymentId ? 'Confirm payment' : 'Record & confirm'}</>}
        </button>
      </div>
    </Modal>
  )
}

// ── Tutors ──────────────────────────────────────────────────────
function AdminTutors() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tutors, setTutors] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [rateModal, setRateModal] = useState(null)
  const [msgModal,  setMsgModal]  = useState(null)
  const [actioning, setActioning] = useState(null)
  const [detailTab, setDetailTab]           = useState('overview')
  const [payrollWeeks, setPayrollWeeks]     = useState([])
  const [openWeek, setOpenWeek]             = useState(null)
  const [weekPayModal, setWeekPayModal]     = useState(null) // { week, existingPaymentId? }
  const [showAcct, setShowAcct] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [approveGate, setApproveGate] = useState(null)  // { id, name }
  const [rejectGate,  setRejectGate]  = useState(null)  // { id, name }
  const [suspendGate, setSuspendGate] = useState(null)  // { tutor, suspend }
  const [suspending,  setSuspending]  = useState(false)

  const load = () => {
    Promise.all([
      api.get('/admin/users?role=tutor').catch(() => ({ data: { data: { users: [] } } })),
      api.get('/admin/tutors/pending').catch(() => ({ data: { data: { tutors: [] } } })),
    ]).then(([tr, pr]) => {
      setTutors(tr.data.data?.users || [])
      setPending(pr.data.data?.tutors || [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const approve = async () => {
    if (!approveGate) return
    setActioning(approveGate.id)
    try {
      await api.patch(`/admin/tutors/${approveGate.id}/approve`)
      setApproveGate(null)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setActioning(null) }
  }

  const reject = async () => {
    if (!rejectGate) return
    setActioning(rejectGate.id)
    try {
      await api.patch(`/admin/tutors/${rejectGate.id}/reject`)
      setRejectGate(null)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setActioning(null) }
  }

  const openDetail = async (u) => {
    setPayrollWeeks([])
    setOpenWeek(null)
    setDetailTab('overview')
    const [detailRes, payrollRes] = await Promise.all([
      api.get(`/admin/tutors/${u.id}/detail`).catch(() => null),
      api.get(`/admin/tutors/${u.id}/payroll/weeks`).catch(() => null),
    ])
    setDetail(detailRes?.data?.data || { tutor: u, sessions: [], sessions_by_week: [] })
    setPayrollWeeks(payrollRes?.data?.data?.weeks || [])
  }

  const refreshPayroll = async (tutorId) => {
    const r = await api.get(`/admin/tutors/${tutorId}/payroll/weeks`).catch(() => null)
    setPayrollWeeks(r?.data?.data?.weeks || [])
  }

  const toggleSuspend = async (reason) => {
    if (!suspendGate) return
    setSuspending(true)
    try {
      await api.patch(`/admin/users/${suspendGate.tutor.id}/suspend`, { suspended: suspendGate.suspend, reason })
      toast.success(suspendGate.suspend ? 'Account suspended' : 'Account reactivated')
      setTutors(p => p.map(t => t.id === suspendGate.tutor.id ? { ...t, suspended: suspendGate.suspend } : t))
      setSuspendGate(null)
      openDetail(suspendGate.tutor)
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setSuspending(false) }
  }

  // Auto-open detail if ?open=<id> is in the URL
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('open')
    if (id && tutors.length > 0 && !detail) {
      const u = tutors.find(x => x.id === id)
      if (u) openDetail(u)
    }
  }, [location.search, tutors])

  const verifyBanking = async (tutorId) => {
    setVerifying(true)
    try {
      await api.post(`/admin/tutors/${tutorId}/banking/verify`)
      const fresh = await api.get(`/admin/tutors/${tutorId}/detail`).catch(() => null)
      if (fresh?.data?.data) setDetail(fresh.data.data)
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setVerifying(false) }
  }

  if (detail) {
    const { tutor, sessions, banking } = detail
    const fmtMethod = m => ({ bank_transfer: 'Bank Transfer', paypal: 'PayPal', check: 'Check', other: 'Other' }[m] || m)
    const maskAcct  = v => v ? (v.length > 4 ? '•'.repeat(v.length - 4) + v.slice(-4) : v) : '—'

    return (
      <div>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, paddingLeft: 0 }} onClick={() => { setDetail(null); setShowAcct(false) }}><ArrowLeft size={16} /> All tutors</button>

        {/* Header card */}
        <div className="card" style={{ padding: 22, display: 'flex', gap: 18, alignItems: 'center', marginBottom: 20 }}>
          <Avatar initials={initOf(tutor)} tint="violet" size={60} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 20, fontFamily: 'var(--font-display)' }}>{tutor.first_name} {tutor.last_name}</span>
              {tutor.username && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>@{tutor.username}</span>}
              {tutor.average_rating > 0 && <StarRating value={tutor.average_rating} size={13} showNum count={tutor.review_count} />}
              {tutor.suspended && <span className="chip chip-alert" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ban size={12} /> Suspended</span>}
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: 2 }}>{tutor.email}</div>
            {tutor.suspended && tutor.suspended_reason && (
              <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 4 }}>Reason: {tutor.suspended_reason}</div>
            )}
            {(tutor.modules || []).length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {tutor.modules.map(m => <span key={m.id} className="chip chip-line" style={{ fontSize: 12 }}>{m.title}</span>)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ textAlign: 'right', display: 'flex', gap: 20 }}>
              <div>
                <div style={{ color: 'var(--text3)', fontSize: 12 }}>Pay rate / session</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>{fmtMoney(tutor.pay_rate || 0)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text3)', fontSize: 12 }}>Weekly base pay</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>{fmtMoney(tutor.weekly_base_pay || 0)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {tutor.suspended ? (
                <button className="btn btn-outline btn-sm" onClick={() => setSuspendGate({ tutor, suspend: false })}>
                  <RotateCcw size={14} /> Reactivate
                </button>
              ) : (
                <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setSuspendGate({ tutor, suspend: true })}>
                  <Ban size={14} /> Suspend
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={() => setRateModal(tutor)}>Edit rates</button>
              <button className="btn btn-primary btn-sm" onClick={() => setMsgModal(tutor)}><Send size={15} /> Message</button>
            </div>
          </div>
        </div>

        {/* Detail tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
          {[['overview', 'Overview'], ['calendar', 'Calendar']].map(([id, label]) => (
            <button key={id} onClick={() => setDetailTab(id)} style={{ padding: '8px 16px', fontWeight: 600, fontSize: 13.5, fontFamily: 'inherit', background: 'none', border: 'none', cursor: 'pointer', borderBottom: detailTab === id ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: '-2px', color: detailTab === id ? 'var(--accent)' : 'var(--text3)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Calendar tab */}
        {detailTab === 'calendar' && (
          <CalendarComponent tutorId={tutor.id} mode="view" viewerTz={tutor.timezone || undefined} />
        )}

        {detailTab === 'overview' && <>

        {/* Payroll summary — 3 stat cards */}
        {(() => {
          const fmtC = c => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })
          const paidTotal    = payrollWeeks.filter(w => w.payment?.status === 'PAID').reduce((s, w) => s + w.payment.totalPayCents, 0)
          const pendingTotal = payrollWeeks.filter(w => w.payment?.status === 'PENDING').reduce((s, w) => s + w.totalPayCents, 0)
          const unpaidTotal  = payrollWeeks.filter(w => !w.payment).reduce((s, w) => s + w.totalPayCents, 0)
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Paid out', value: fmtC(paidTotal),    tint: 'teal',   Icon: Check },
                { label: 'Pending',  value: fmtC(pendingTotal), tint: 'amber',  Icon: Clock },
                { label: 'Unpaid',   value: fmtC(unpaidTotal),  tint: 'violet', Icon: DollarSign },
              ].map(({ label, value, tint, Icon }) => (
                <div key={label} className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: TINTS[tint].bg, color: TINTS[tint].fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon size={21} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: 'var(--text2)' }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Banking details card */}
        <div className="card" style={{ padding: 22, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Landmark size={18} style={{ color: 'var(--accent)' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>Banking details</span>
            </div>
            {banking && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAcct(v => !v)}>
                  {showAcct ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Reveal</>}
                </button>
                {!banking.verified && (
                  <button className="btn btn-outline btn-sm" disabled={verifying} onClick={() => verifyBanking(tutor.id)}>
                    {verifying ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <><BadgeCheck size={14} /> Verify</>}
                  </button>
                )}
              </div>
            )}
          </div>

          {!banking ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 14, padding: '12px 0', borderStyle: 'dashed', borderWidth: 1, borderRadius: 10, borderColor: 'var(--border)' }}>
              Tutor has not added banking details yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['Account holder', banking.account_holder_name],
                ['Preferred method', fmtMethod(banking.preferred_method)],
                banking.bank_name      ? ['Bank name',       banking.bank_name]                             : null,
                banking.account_type   ? ['Account type',    banking.account_type]                          : null,
                banking.account_number ? ['Account number',  showAcct ? banking.account_number : maskAcct(banking.account_number)] : null,
                banking.routing_number ? ['Routing number',  showAcct ? banking.routing_number : maskAcct(banking.routing_number)] : null,
                banking.iban           ? ['IBAN',            showAcct ? banking.iban : maskAcct(banking.iban)]                     : null,
                banking.swift_code     ? ['SWIFT / BIC',     banking.swift_code]                            : null,
                banking.paypal_email   ? ['PayPal email',    showAcct ? banking.paypal_email : maskAcct(banking.paypal_email)]     : null,
                banking.notes          ? ['Notes',           banking.notes]                                 : null,
                banking.verified       ? ['Verified by',     `${banking.verifier?.first_name || ''} ${banking.verifier?.last_name || ''} · ${new Date(banking.verified_at).toLocaleDateString()}`] : null,
              ].filter(Boolean).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: ['Account number','Routing number','IBAN'].includes(label) ? 'monospace' : 'inherit' }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payroll weeks */}
        <h3 style={{ fontSize: 16, marginBottom: 14, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Payroll</h3>
        {payrollWeeks.length === 0
          ? <EmptyState text="No completed sessions yet." />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
              {payrollWeeks.map(week => {
                const wk      = new Date(week.weekStart).toISOString().slice(0, 10)
                const isOpen  = openWeek === wk
                const { payment } = week
                const paid    = payment?.status === 'PAID'
                const pending = payment?.status === 'PENDING'
                const fmtC    = c => '$' + (Number(c || 0) / 100).toFixed(2)
                const fmtWR   = (s, e) => {
                  const a = new Date(s), b = new Date(e)
                  const f = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  return `${f(a)} – ${f(b)}`
                }
                return (
                  <div key={wk} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <button onClick={() => setOpenWeek(isOpen ? null : wk)} style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: paid ? '#e1f5f1' : pending ? '#fbf0db' : 'var(--bg2)', color: paid ? '#0f9b8e' : pending ? '#d98a1f' : 'var(--text3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {paid ? <Check size={22} strokeWidth={2.4} /> : pending ? <Clock size={22} /> : <DollarSign size={22} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>{fmtWR(week.weekStart, week.weekEnd)}</div>
                        <div style={{ color: 'var(--text3)', fontSize: 12.5, marginTop: 2 }}>
                          {week.sessionCount} session{week.sessionCount !== 1 ? 's' : ''} · {fmtC(week.totalPayCents)} total
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em' }}>{fmtC(week.totalPayCents)}</div>
                          <span className={paid ? 'chip chip-good' : pending ? 'chip chip-soft' : 'chip'} style={{ fontSize: 11, display: 'inline-block', marginTop: 2 }}>
                            {paid ? 'Paid' : pending ? 'Pending' : 'Unpaid'}
                          </span>
                        </div>
                        <ChevronRight size={17} style={{ color: 'var(--text3)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
                      </div>
                    </button>

                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px 18px' }}>
                        {/* Pay breakdown */}
                        <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Pay breakdown</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
                            {[
                              ['Pay rate', fmtC(week.payRateCents) + ' / session'],
                              ['Sessions', String(week.sessionCount)],
                              ['Session pay', fmtC(week.sessionPayCents)],
                              ['Weekly base pay', fmtC(week.basePayCents)],
                            ].map(([label, val]) => (
                              <div key={label}>
                                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 1 }}>{label}</div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{val}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>Total</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em', color: '#0f9b8e' }}>{fmtC(week.totalPayCents)}</span>
                          </div>
                        </div>

                        {/* Payment status / action */}
                        {paid ? (
                          <div style={{ marginBottom: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#15803d' }}>Payment confirmed</span>
                              {payment.approvedAt && (
                                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(payment.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                              {payment.referenceNumber && (
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Reference</div>
                                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{payment.referenceNumber}</div>
                                </div>
                              )}
                              {payment.notes && (
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Notes</div>
                                  <div style={{ fontSize: 13 }}>{payment.notes}</div>
                                </div>
                              )}
                              {payment.approvedByEmail && (
                                <div style={{ marginLeft: 'auto' }}>
                                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Confirmed by</div>
                                  <div style={{ fontSize: 13 }}>{payment.approvedByEmail}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => setWeekPayModal({ week, existingPaymentId: pending ? payment.id : null })}>
                              {pending ? <><Check size={14} /> Mark as paid</> : <><Plus size={14} /> Record payment</>}
                            </button>
                          </div>
                        )}

                        {/* Sessions list */}
                        {week.sessions.length > 0 && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Sessions</div>
                            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ background: 'var(--bg2)' }}>
                                    {['Session', 'Student', 'Date', 'Start', 'Duration'].map(h => (
                                      <th key={h} style={{ padding: '7px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {week.sessions.map((s, si) => (
                                    <tr key={s.id} style={{ borderTop: si > 0 ? '1px solid var(--border)' : 'none' }}>
                                      <td style={{ padding: '9px 12px', fontSize: 12.5 }}>{s.subject || 'Session'}</td>
                                      <td style={{ padding: '9px 12px', fontSize: 12.5, color: 'var(--text2)' }}>{s.studentName}{s.studentUsername && <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>@{s.studentUsername}</span>}</td>
                                      <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text3)' }}>{fmtDate(s.scheduledDate, { month: 'short', day: 'numeric' })}</td>
                                      <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text3)' }}>{s.startTime}</td>
                                      <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text3)' }}>{s.durationMinutes} min</td>
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
            </div>
          )
        }

        </> }

        <RateModal tutor={rateModal} onClose={() => setRateModal(null)} onSaved={async ({ pay_rate, weekly_base_pay }) => {
          setDetail(d => ({ ...d, tutor: { ...d.tutor, pay_rate, weekly_base_pay } }))
          setRateModal(null)
          const fresh = await api.get(`/admin/tutors/${rateModal.id}/detail`).catch(() => null)
          if (fresh?.data?.data) setDetail(fresh.data.data)
        }} />
        <MsgModal tutor={msgModal} onClose={() => setMsgModal(null)} />
        <EmailGateModal
          open={!!suspendGate}
          title={suspendGate?.suspend ? `Suspend ${suspendGate?.tutor?.first_name || 'tutor'}?` : `Reactivate ${suspendGate?.tutor?.first_name || 'tutor'}?`}
          description={suspendGate?.suspend
            ? `${suspendGate?.tutor?.first_name} ${suspendGate?.tutor?.last_name} will be signed out and unable to log in until the account is reactivated. Their scheduled sessions stay on the calendar.`
            : `${suspendGate?.tutor?.first_name} ${suspendGate?.tutor?.last_name} will be able to log in and tutor again immediately.`}
          confirmLabel={suspendGate?.suspend ? 'Suspend account' : 'Reactivate account'}
          danger={!!suspendGate?.suspend}
          reasonLabel={suspendGate?.suspend ? 'Reason for suspension' : undefined}
          loading={suspending}
          onConfirm={toggleSuspend}
          onClose={() => setSuspendGate(null)}
        />
        {weekPayModal && (
          <AdminWeekPayModal
            tutor={tutor}
            week={weekPayModal.week}
            existingPaymentId={weekPayModal.existingPaymentId || null}
            onClose={() => setWeekPayModal(null)}
            onSaved={() => { refreshPayroll(tutor.id); setWeekPayModal(null) }}
          />
        )}
      </div>
    )
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
  return (
    <>
      <EmailGateModal
        open={!!approveGate}
        title={`Approve ${approveGate?.name || 'tutor'}?`}
        description={`This will activate ${approveGate?.name || 'this tutor'}'s account and notify them by email. They will be able to log in immediately.`}
        confirmLabel="Approve tutor"
        danger={false}
        loading={actioning === approveGate?.id}
        onConfirm={approve}
        onClose={() => setApproveGate(null)}
      />
      <EmailGateModal
        open={!!rejectGate}
        title={`Reject & delete ${rejectGate?.name || 'tutor'}?`}
        description={`This will permanently delete ${rejectGate?.name || 'this tutor'}'s account. This cannot be undone.`}
        confirmLabel="Reject & delete account"
        danger={true}
        loading={actioning === rejectGate?.id}
        onConfirm={reject}
        onClose={() => setRejectGate(null)}
      />

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>Pending approval</span>
            <span className="chip chip-alert" style={{ padding: '1px 8px', fontSize: 11.5 }}>{pending.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((t, i) => (
              <div key={t.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, border: '1px solid #fcd34d', background: '#fffbeb' }}>
                <Avatar initials={`${t.first_name?.[0]||''}${t.last_name?.[0]||''}`} tint="amber" size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t.first_name} {t.last_name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 13 }}>{t.email}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>Applied {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                </div>
                <button className="btn btn-primary btn-sm" disabled={!!actioning} onClick={() => setApproveGate({ id: t.id, name: `${t.first_name} ${t.last_name}` })}>
                  <Check size={13} /> Approve
                </button>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={!!actioning} onClick={() => setRejectGate({ id: t.id, name: `${t.first_name} ${t.last_name}` })}>
                  <X size={13} /> Reject
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved tutors */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Tutor', 'Email', 'Rating', 'Sessions', ''].map((h, i) => <th key={i} style={{ padding: '12px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'left', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {tutors.map((u, i) => (
              <tr key={u.id} onClick={() => openDetail(u)} style={{ cursor: 'pointer', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '12px 18px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar initials={initOf(u)} tint={tintOf(i)} size={34} /><div><div style={{ fontWeight: 600, fontSize: 14 }}>{u.first_name} {u.last_name}{u.suspended && <span className="chip chip-alert" style={{ fontSize: 11, marginLeft: 6 }}>Suspended</span>}</div>{u.username && <div style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 600 }}>@{u.username}</div>}</div></div></td>
                <td style={{ padding: '12px 18px', color: 'var(--text3)', fontSize: 13 }}>{u.email}</td>
                <td style={{ padding: '12px 18px' }}>{u.average_rating ? <StarRating value={u.average_rating} size={12} showNum /> : <span style={{ color: 'var(--text3)', fontSize: 13 }}>—</span>}</td>
                <td style={{ padding: '12px 18px', fontWeight: 600, fontSize: 14 }}>{u.session_count || 0}</td>
                <td style={{ padding: '12px 18px', textAlign: 'right' }}><ChevronRight size={16} style={{ color: 'var(--text3)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {tutors.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>No tutors found.</div>}
      </div>
    </>
  )
}

function RateModal({ tutor, onClose, onSaved }) {
  const [rate, setRate]         = useState(0)
  const [basePay, setBasePay]   = useState(0)
  const [reason, setReason]     = useState('')
  const [saving, setSaving]     = useState(false)
  useEffect(() => {
    if (tutor) {
      setRate(tutor.pay_rate || 0)
      setBasePay(tutor.weekly_base_pay || 0)
      setReason('')
    }
  }, [tutor])
  if (!tutor) return null
  const save = async () => {
    if (!reason.trim()) return
    setSaving(true)
    try {
      await api.patch(`/admin/tutors/${tutor.id}/pay-rate`, {
        rate:                  Math.round(rate * 100),
        weekly_base_pay_cents: Math.round(basePay * 100),
        reason,
      })
      onSaved?.({ pay_rate: rate, weekly_base_pay: basePay })
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to update rate') }
    finally { setSaving(false) }
  }
  return (
    <Modal open={!!tutor} onClose={onClose} width={460}>
      <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Edit pay rates</h2>
      <p style={{ fontSize: 13.5, color: 'var(--text3)', marginTop: 4 }}>{tutor.first_name} {tutor.last_name}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18 }}>
        <div className="field">
          <label>Pay rate per session</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: 12, fontWeight: 700, color: 'var(--text2)' }}>$</span>
            <input className="input" type="number" min={0} step={5} value={rate} onChange={e => setRate(Number(e.target.value))} style={{ paddingLeft: 26, fontWeight: 700 }} />
          </div>
        </div>
        <div className="field">
          <label>Weekly base pay</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: 12, fontWeight: 700, color: 'var(--text2)' }}>$</span>
            <input className="input" type="number" min={0} step={5} value={basePay} onChange={e => setBasePay(Number(e.target.value))} style={{ paddingLeft: 26, fontWeight: 700 }} />
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
        Weekly total = (<b>${rate}</b> × sessions) + <b>${basePay}</b> base pay
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label>Reason (logged)</label>
        <input className="input" placeholder="e.g. Senior tier promotion" value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      <button className="btn btn-primary btn-full btn-lg" style={{ marginTop: 18 }} disabled={!reason.trim() || saving} onClick={save}>
        {saving ? <><span className="spinner" /> Saving…</> : 'Save rates'}
      </button>
    </Modal>
  )
}

function MsgModal({ tutor, onClose }) {
  const [body, setBody]   = useState('')
  const [sending, setSending] = useState(false)
  useEffect(() => { if (tutor) setBody('') }, [tutor])
  if (!tutor) return null
  const send = async () => {
    if (!body.trim()) return
    setSending(true)
    try {
      await api.post('/notifications/send', { title: 'Message from Admin', message: body, target: tutor.id })
      onClose()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to send') }
    finally { setSending(false) }
  }
  return (
    <Modal open={!!tutor} onClose={onClose} width={460}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Avatar initials={initOf(tutor)} tint="violet" size={44} />
        <div><div style={{ fontWeight: 700, fontSize: 16 }}>Message {tutor.first_name} {tutor.last_name}</div><div style={{ color: 'var(--text3)', fontSize: 13 }}>Delivered to their Notifications tab</div></div>
      </div>
      <textarea className="form-input" placeholder="Write your message…" value={body} onChange={e => setBody(e.target.value)} style={{ minHeight: 120, resize: 'vertical' }} />
      <button className="btn btn-primary btn-full" style={{ marginTop: 14 }} disabled={!body.trim() || sending} onClick={send}>
        {sending ? <><span className="spinner" /> Sending…</> : <><Send size={16} /> Send message</>}
      </button>
    </Modal>
  )
}

// ── Payments ────────────────────────────────────────────────────
function AdminPayments() {
  const navigate = useNavigate()
  const [txs, setTxs]             = useState([])
  const [loading, setLoading]     = useState(true)
  const [refundTx, setRefundTx]   = useState(null)
  const [receiptTx, setReceiptTx] = useState(null)
  const [search, setSearch]       = useState('')

  const load = () => api.get('/admin/payments').then(r => setTxs(r.data.data?.payments || [])).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const openFullReceipt = async (t) => {
    try {
      const r = await api.get(`/admin/payments/${t.id}`)
      setReceiptTx(r.data.data?.payment || t)
    } catch { setReceiptTx(t) }
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? txs.filter(t => {
        const name    = `${t.student?.first_name || ''} ${t.student?.last_name || ''}`.toLowerCase()
        const email   = (t.student?.email || '').toLowerCase()
        const receipt = (t.receipt_number || '').toLowerCase()
        return name.includes(q) || email.includes(q) || receipt.includes(q)
      })
    : txs

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
  return (
    <>
      {/* Search bar */}
      <div style={{ marginBottom: 14 }}>
        <input
          className="form-input"
          placeholder="Search by student name, email, or receipt no…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 420, fontSize: 13.5 }}
        />
        {q && (
          <span style={{ marginLeft: 12, fontSize: 12.5, color: 'var(--text3)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Student', 'Plan', 'Amount', 'Date', 'Receipt No.', ''].map((h, i) => <th key={i} style={{ padding: '12px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', textAlign: i === 2 ? 'right' : 'left', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={t.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '11px 18px', fontWeight: 600, fontSize: 14 }}>
                  <button onClick={() => navigate(`/admin/students?open=${t.student?.id}`)} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 600, fontSize: 14, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit', textAlign: 'left' }}>
                    {t.student?.first_name || ''} {t.student?.last_name || ''}
                  </button>
                  <div style={{ color: 'var(--text3)', fontSize: 12 }}>{t.student?.email || ''}</div>
                </td>
                <td style={{ padding: '11px 18px' }}>
                  <span className="chip chip-line" style={{ fontSize: 12 }}>{t.managed_plan?.name || t.plan?.plan_type || '—'}</span>
                </td>
                <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-display)', color: t.status === 'refunded' ? 'var(--text3)' : 'var(--success)', textDecoration: t.status === 'refunded' ? 'line-through' : 'none' }}>
                  {fmtMoney((t.amount_cents || 0) / 100)}
                </td>
                <td style={{ padding: '11px 18px', color: 'var(--text3)', fontSize: 13 }}>{fmtDate(t.created_at, { month: 'short', day: 'numeric' })}</td>
                <td style={{ padding: '11px 18px' }}>
                  {t.receipt_number
                    ? <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{t.receipt_number}</span>
                    : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '11px 18px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => openFullReceipt(t)}>
                      <Receipt size={13} /> Receipt
                    </button>
                    {t.status !== 'refunded' && (
                      <button className="btn btn-outline btn-sm" onClick={() => setRefundTx(t)}>Refund</button>
                    )}
                    {t.status === 'refunded' && (
                      <span className="chip chip-alert">Refunded</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
            {q ? `No payments match "${search}".` : 'No payments found.'}
          </div>
        )}
      </div>
      <RefundModal tx={refundTx} onClose={() => setRefundTx(null)} onRefunded={id => { setTxs(p => p.map(t => t.id === id ? { ...t, status: 'refunded' } : t)); setRefundTx(null) }} />
      <PaymentReceiptModal payment={receiptTx} onClose={() => setReceiptTx(null)} />
    </>
  )
}

function RefundModal({ tx, onClose, onRefunded }) {
  const { user } = useAuth()
  const [detail, setDetail]   = useState(null)
  const [email, setEmail]     = useState('')
  const [reason, setReason]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tx) return
    setEmail(''); setReason(''); setDetail(null)
    api.get(`/admin/payments/${tx.id}`)
      .then(r => setDetail(r.data.data?.payment || tx))
      .catch(() => setDetail(tx))
  }, [tx])

  if (!tx) return null

  const planName    = detail?.managed_plan?.name || tx.plan?.plan_type || 'Plan'
  const enrollments = detail?.module_enrollments || []
  const ok = email.trim().toLowerCase() === (user?.email || '').toLowerCase()

  const doRefund = async () => {
    if (!ok || !reason) return
    setLoading(true)
    try {
      await api.post(`/admin/payments/${tx.id}/refund`, { reason })
      onRefunded(tx.id)
    } catch (e) { toast.error(e.response?.data?.error || 'Refund failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={!!tx} onClose={onClose} width={460}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--danger-bg)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
        <Receipt size={26} style={{ color: 'var(--danger)' }} />
      </div>
      <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Refund {fmtMoney((tx.amount_cents || 0) / 100)}</h2>
      <p style={{ fontSize: 13.5, color: 'var(--text3)', marginTop: 4 }}>{planName} · {tx.student?.email || ''}</p>

      {!detail && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <span className="spinner" style={{ width: 20, height: 20 }} />
        </div>
      )}
      {enrollments.length > 0 && (
        <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Credits included in this plan
          </div>
          {enrollments.map((e, i) => (
            <div key={e.module_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: i < enrollments.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{e.module?.name || 'Module'}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: '#2563eb' }}>{e.credits_purchased ?? '—'} credits</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, padding: '9px 13px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text3)' }}>
        Credits are not deducted automatically. After refunding, go to the student's account to adjust credits manually.
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label>Reason for refund (logged)</label>
        <input className="input" placeholder="e.g. Duplicate charge" value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Confirm your admin email to authorize</label>
        <input className="input" placeholder={user?.email || 'your@email.com'} value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      {email && !ok && <div style={{ fontSize: 12.5, color: 'var(--danger)', marginTop: 6 }}>Email doesn't match your admin account.</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button
          style={{ flex: 2, height: 44, borderRadius: 999, background: 'var(--danger)', color: '#fff', fontWeight: 700, border: 'none', cursor: (!ok || !reason || loading) ? 'not-allowed' : 'pointer', opacity: (!ok || !reason || loading) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
          disabled={!ok || !reason || loading}
          onClick={doRefund}
        >
          {loading ? <><span className="spinner" /> Processing…</> : 'Process Refund'}
        </button>
      </div>
    </Modal>
  )
}

// ── Payroll ─────────────────────────────────────────────────────
function fmtCents(cents) { return '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtWeekRange(start, end) {
  const a = new Date(start), b = new Date(end)
  const f = (d, y) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) })
  return `${f(a)} – ${f(b, true)}`
}
function statusBadge(status) {
  if (status === 'PAID')    return <span className="chip chip-good" style={{ fontSize: 11 }}>Paid</span>
  if (status === 'PENDING') return <span className="chip chip-soft" style={{ fontSize: 11 }}>Pending</span>
  return <span className="chip" style={{ fontSize: 11 }}>Unpaid</span>
}

function AdminPayroll() {
  const [tab, setTab] = useState('weekly')

  return (
    <div>
      <SegTabs
        tabs={[
          { id: 'weekly',   label: 'Weekly Payroll' },
          { id: 'activity', label: 'Payment Activity' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ marginTop: 20 }}>
        {tab === 'weekly'   && <AdminPayrollWeekly />}
        {tab === 'activity' && <AdminPayrollActivity />}
      </div>
    </div>
  )
}

function AdminPayrollWeekly() {
  const navigate = useNavigate()
  const [weeks, setWeeks]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [openWeek, setOpenWeek]   = useState(null)  // weekStart ISO string
  const [openTutor, setOpenTutor] = useState(null)  // "weekKey|tutorId"
  const [paying, setPaying]       = useState(null)   // tutorId being paid
  const [payingAll, setPayingAll] = useState(null)   // weekKey being paid-all

  const load = () => {
    setLoading(true)
    api.get('/admin/payroll/weeks')
      .then(r => setWeeks(r.data.data?.weeks || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handlePayTutor = async (weekStartISO, tutorId) => {
    setPaying(tutorId)
    try {
      await api.post('/admin/payroll/pay/weekly', { tutorId, weekStart: weekStartISO })
      toast.success('Payment submitted')
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setPaying(null) }
  }

  const handlePayAll = async (weekStartISO) => {
    if (!(await confirmDialog('Submit payment for all unpaid tutors this week?'))) return
    setPayingAll(weekStartISO)
    try {
      const r = await api.post('/admin/payroll/pay/week-all', { weekStart: weekStartISO })
      toast.success(`${r.data.data?.created ?? 0} payment(s) submitted`)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setPayingAll(null) }
  }

  const weekStartKey = (w) => new Date(w.weekStart).toISOString().slice(0, 10)
  const thStyle = { padding: '9px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '11px 14px', fontSize: 13, borderTop: '1px solid var(--border)', verticalAlign: 'middle' }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>

  if (!weeks.length) return <EmptyState text="No completed sessions found." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {weeks.map(week => {
        const wk = weekStartKey(week)
        const isOpen = openWeek === wk
        const allPaid = week.tutors.every(t => t.paymentStatus !== 'UNPAID')
        const aggTotal = week.tutors.reduce((s, t) => s + t.totalPayCents, 0)
        return (
          <div key={wk} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Week header */}
            <div
              style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', background: isOpen ? 'var(--bg2)' : '' }}
              onClick={() => setOpenWeek(isOpen ? null : wk)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 15 }}>{fmtWeekRange(week.weekStart, week.weekEnd)}</div>
                <div style={{ color: 'var(--text3)', fontSize: 12.5, marginTop: 2 }}>
                  {week.tutors.length} tutor{week.tutors.length !== 1 ? 's' : ''} · {fmtCents(aggTotal)} total
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                disabled={allPaid || payingAll === wk}
                onClick={e => { e.stopPropagation(); handlePayAll(wk) }}
              >
                {payingAll === wk ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <DollarSign size={13} />}
                Pay All
              </button>
              <ChevronDown size={16} style={{ color: 'var(--text3)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }} />
            </div>

            {/* Tutor table */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Tutor</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Pay Rate</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Session Pay</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Base Pay</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {week.tutors.map(t => {
                        const rowKey = `${wk}|${t.tutorId}`
                        const isExpandedTutor = openTutor === rowKey
                        return (
                          <>
                            <tr key={t.tutorId} style={{ background: isExpandedTutor ? 'var(--bg2)' : '' }}>
                              <td style={tdStyle}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <Avatar initials={t.tutorName.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)} tint="violet" size={32} />
                                  <div>
                                    <button
                                      onClick={() => navigate(`/admin/tutors?open=${t.tutorId}`)}
                                      style={{ background: 'none', border: 'none', padding: 0, fontWeight: 600, fontSize: 13, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit' }}
                                    >{t.tutorName}</button>
                                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.tutorEmail}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{t.sessionCount}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text2)' }}>{fmtCents(t.payRateCents)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCents(t.sessionPayCents)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCents(t.basePayCents)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#0f9b8e' }}>{fmtCents(t.totalPayCents)}</td>
                              <td style={{ ...tdStyle, textAlign: 'center' }}>{statusBadge(t.paymentStatus)}</td>
                              <td style={{ ...tdStyle, textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '4px 10px', fontSize: 12 }}
                                    onClick={() => setOpenTutor(isExpandedTutor ? null : rowKey)}
                                  >
                                    {isExpandedTutor ? 'Hide' : 'Sessions'}
                                    <ChevronDown size={12} style={{ transform: isExpandedTutor ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                                  </button>
                                  {t.paymentStatus === 'UNPAID' && (
                                    <button
                                      className="btn btn-primary btn-sm"
                                      style={{ padding: '4px 12px', fontSize: 12 }}
                                      disabled={paying === t.tutorId}
                                      onClick={() => handlePayTutor(wk, t.tutorId)}
                                    >
                                      {paying === t.tutorId ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <DollarSign size={12} />}
                                      Pay
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {/* Session sub-rows */}
                            {isExpandedTutor && (
                              <tr key={`${t.tutorId}-sessions`}>
                                <td colSpan={8} style={{ padding: 0, background: '#fafaf8' }}>
                                  <div style={{ padding: '10px 20px 14px 56px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                      <thead>
                                        <tr>
                                          {['Session', 'Student', 'Date', 'Start', 'Duration'].map(h => (
                                            <th key={h} style={{ padding: '5px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {t.sessions.map((s, si) => (
                                          <tr key={s.id} style={{ borderTop: si > 0 ? '1px solid var(--border)' : 'none' }}>
                                            <td style={{ padding: '8px 10px', fontSize: 12.5, fontWeight: 500 }}>{s.subject || 'Session'}</td>
                                            <td style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--text2)' }}>{s.studentName}</td>
                                            <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text3)' }}>{fmtDate(s.scheduledDate, { month: 'short', day: 'numeric' })}</td>
                                            <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text3)' }}>{s.startTime}</td>
                                            <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text3)' }}>{s.durationMinutes} min</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BankingPanel({ banking }) {
  if (!banking) return <div style={{ color: 'var(--text3)', fontSize: 13, fontStyle: 'italic' }}>No banking details on file</div>
  const method = banking.preferred_method || 'bank_transfer'
  const rows = []
  rows.push(['Preferred method', { bank_transfer: 'Bank Transfer', paypal: 'PayPal', check: 'Check', other: 'Other' }[method] || method])
  if (banking.account_holder_name) rows.push(['Account holder', banking.account_holder_name])
  if (banking.bank_name)           rows.push(['Bank', banking.bank_name])
  if (banking.account_type)        rows.push(['Account type', banking.account_type])
  if (banking.account_number)      rows.push(['Account #', '•••• ' + banking.account_number.slice(-4)])
  if (banking.routing_number)      rows.push(['Routing #', banking.routing_number])
  if (banking.iban)                rows.push(['IBAN', banking.iban])
  if (banking.swift_code)          rows.push(['SWIFT', banking.swift_code])
  if (banking.paypal_email)        rows.push(['PayPal', banking.paypal_email])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map(([label, val]) => (
        <div key={label} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
          <span style={{ color: 'var(--text3)', width: 120, flexShrink: 0 }}>{label}</span>
          <span style={{ fontWeight: 500, wordBreak: 'break-all' }}>{val}</span>
        </div>
      ))}
      {banking.verified && <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, color: '#0f9b8e', fontSize: 12 }}><Check size={11} strokeWidth={2.5} /> Verified</div>}
    </div>
  )
}

function AdminPayrollActivity() {
  const navigate = useNavigate()
  const [payments, setPayments]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [markingDone, setMarkingDone] = useState(null)
  const [doneModal, setDoneModal]     = useState(null)
  const [detailModal, setDetailModal] = useState(null)
  // done modal form state
  const [confirmerEmail, setConfirmerEmail] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [paymentNotes, setPaymentNotes]       = useState('')
  const [emailErr, setEmailErr]   = useState('')
  const [expandedBanking, setExpandedBanking] = useState(null) // row payment id

  const load = () => {
    setLoading(true)
    api.get('/admin/payroll/activity')
      .then(r => setPayments(r.data.data?.payments || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openDoneModal = p => {
    setDoneModal(p)
    setConfirmerEmail('')
    setReferenceNumber('')
    setPaymentNotes('')
    setEmailErr('')
  }

  const handleMarkDone = async () => {
    if (!confirmerEmail.trim()) { setEmailErr('Email is required'); return }
    setEmailErr('')
    setMarkingDone(doneModal.id)
    try {
      await api.patch(`/admin/payroll/activity/${doneModal.id}/done`, {
        confirmedByEmail: confirmerEmail.trim(),
        referenceNumber:  referenceNumber.trim() || undefined,
        notes:            paymentNotes.trim()    || undefined,
      })
      toast.success('Payment marked as done')
      setDoneModal(null)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setMarkingDone(null) }
  }

  const thStyle = { padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '12px 14px', fontSize: 13, borderTop: '1px solid var(--border)', verticalAlign: 'middle' }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>

  return (
    <>
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Tutor</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Banking</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Week</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Session Pay</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Base Pay</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Ref / Check #</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Confirmed By</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const banking = p.tutor?.banking_details
                const isExpanded = expandedBanking === p.id
                return (
                  <>
                    <tr key={p.id} style={{ background: isExpanded ? '#fafaf8' : '' }}>
                      <td style={tdStyle}>
                        <div>
                          <button
                            onClick={() => navigate(`/admin/tutors?open=${p.tutor.id}`)}
                            style={{ background: 'none', border: 'none', padding: 0, fontWeight: 600, fontSize: 13, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit' }}
                          >{p.tutor.first_name} {p.tutor.last_name}</button>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.tutor.email}</div>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {banking ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 11, padding: '3px 9px' }}
                            onClick={() => setExpandedBanking(isExpanded ? null : p.id)}
                          >
                            <Landmark size={11} />
                            {banking.preferred_method === 'paypal' ? 'PayPal' : 'Bank'}
                            {banking.verified && <Check size={10} style={{ color: '#0f9b8e' }} />}
                            <ChevronDown size={10} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>None</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text2)', whiteSpace: 'nowrap', fontSize: 12.5 }}>{fmtWeekRange(p.week_start, p.week_end)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{p.sessions_completed}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCents(p.session_pay_cents)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCents(p.base_pay_cents)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#0f9b8e' }}>{fmtCents(p.total_pay_cents)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{statusBadge(p.status)}</td>
                      <td style={{ ...tdStyle, fontSize: 12 }}>
                        {p.reference_number
                          ? <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>{p.reference_number}</span>
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                        {p.payment_notes && <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>{p.payment_notes}</div>}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text2)' }}>
                        {p.approved_by_email
                          ? <div><div style={{ fontWeight: 500 }}>{p.approved_by_email}</div><div style={{ color: 'var(--text3)', fontSize: 11 }}>{fmtDate(p.approved_at)}</div></div>
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          {p.status === 'PENDING' && (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: 12 }}
                              disabled={markingDone === p.id}
                              onClick={() => openDoneModal(p)}
                            >
                              <Check size={12} /> Mark Done
                            </button>
                          )}
                          {p.status === 'PAID' && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11 }}
                              onClick={() => setDetailModal(p)}
                            >
                              <Eye size={11} /> Receipt
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Banking details sub-row */}
                    {isExpanded && banking && (
                      <tr key={`${p.id}-banking`}>
                        <td colSpan={11} style={{ padding: '12px 20px 14px 20px', background: '#fafaf8', borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Banking details</div>
                          <BankingPanel banking={banking} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
        {!payments.length && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>No payroll payments recorded yet.</div>
        )}
      </div>

      {/* Mark Done modal */}
      {doneModal && (
        <Modal open onClose={() => setDoneModal(null)} width={520}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>Confirm payment</div>
            <button onClick={() => setDoneModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', display: 'flex' }}><X size={17} /></button>
          </div>

          {/* Pay summary */}
          <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{doneModal.tutor?.first_name} {doneModal.tutor?.last_name}</div>
            <div style={{ color: 'var(--text3)', marginBottom: 8 }}>{fmtWeekRange(doneModal.week_start, doneModal.week_end)}</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div><div style={{ color: 'var(--text3)', fontSize: 11.5 }}>Sessions</div><div style={{ fontWeight: 600 }}>{doneModal.sessions_completed}</div></div>
              <div><div style={{ color: 'var(--text3)', fontSize: 11.5 }}>Session pay</div><div style={{ fontWeight: 600 }}>{fmtCents(doneModal.session_pay_cents)}</div></div>
              <div><div style={{ color: 'var(--text3)', fontSize: 11.5 }}>Base pay</div><div style={{ fontWeight: 600 }}>{fmtCents(doneModal.base_pay_cents)}</div></div>
              <div><div style={{ color: 'var(--text3)', fontSize: 11.5 }}>Total</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: '#0f9b8e' }}>{fmtCents(doneModal.total_pay_cents)}</div></div>
            </div>
          </div>

          {/* Banking details */}
          {doneModal.tutor?.banking_details && (
            <div style={{ background: '#e7effe', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Send payment to</div>
              <BankingPanel banking={doneModal.tutor.banking_details} />
            </div>
          )}
          {!doneModal.tutor?.banking_details && (
            <div style={{ background: '#fdecea', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
              No banking details on file for this tutor. Coordinate payment manually.
            </div>
          )}

          {/* Form fields */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>Confirmer email <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              className="input"
              type="email"
              placeholder="admin@example.com"
              value={confirmerEmail}
              onChange={e => { setConfirmerEmail(e.target.value); setEmailErr('') }}
              style={{ width: '100%' }}
            />
            {emailErr && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{emailErr}</div>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>Check / Receipt #<span style={{ color: 'var(--text3)', fontWeight: 400 }}> (optional)</span></label>
            <input
              className="input"
              placeholder="e.g. CHK-20240601, TXN-8842…"
              value={referenceNumber}
              onChange={e => setReferenceNumber(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>Notes<span style={{ color: 'var(--text3)', fontWeight: 400 }}> (optional)</span></label>
            <textarea
              className="input"
              placeholder="Any details about this payment…"
              value={paymentNotes}
              onChange={e => setPaymentNotes(e.target.value)}
              style={{ width: '100%', minHeight: 70, resize: 'vertical' }}
            />
          </div>

          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
            This will mark the payment as PAID, email the tutor a receipt, and log the action in the admin logbook.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setDoneModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={markingDone === doneModal.id} onClick={handleMarkDone}>
              {markingDone === doneModal.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Check size={14} />}
              Confirm & send receipt
            </button>
          </div>
        </Modal>
      )}

      {/* Receipt detail modal (PAID records) */}
      {detailModal && (
        <Modal open onClose={() => setDetailModal(null)} width={500}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>Payment Receipt</div>
            <button onClick={() => setDetailModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', display: 'flex' }}><X size={17} /></button>
          </div>
          {[
            ['Tutor',            `${detailModal.tutor?.first_name} ${detailModal.tutor?.last_name}`],
            ['Week',             fmtWeekRange(detailModal.week_start, detailModal.week_end)],
            ['Sessions',         String(detailModal.sessions_completed)],
            ['Session Pay',      fmtCents(detailModal.session_pay_cents)],
            ['Base Pay',         fmtCents(detailModal.base_pay_cents)],
            ['Total',            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: '#0f9b8e' }}>{fmtCents(detailModal.total_pay_cents)}</span>],
            detailModal.reference_number && ['Check / Receipt #', <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{detailModal.reference_number}</span>],
            ['Confirmed By',     detailModal.approved_by_email],
            ['Confirmed On',     fmtDate(detailModal.approved_at)],
            detailModal.payment_notes && ['Notes', detailModal.payment_notes],
          ].filter(Boolean).map(([label, value], i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', gap: 14 }}>
              <div style={{ width: 150, flexShrink: 0, fontSize: 13, color: 'var(--text3)' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
            </div>
          ))}
          {detailModal.tutor?.banking_details && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Banking details</div>
              <BankingPanel banking={detailModal.tutor.banking_details} />
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// ── Payment Records ─────────────────────────────────────────────
function AdminRecords() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [tutor,   setTutor]   = useState('all')
  const [detail,  setDetail]  = useState(null)

  useEffect(() => {
    api.get('/admin/payment-records')
      .then(r => setRecords(r.data.data?.records || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const fmtMethod = m => ({ bank_transfer: 'Bank Transfer', paypal: 'PayPal', check: 'Check', other: 'Other' }[m] || m)
  const receiptId = id => id?.slice(-8).toUpperCase()

  const tutorOptions = [...new Map(records.map(r => [r.tutor?.id, r.tutor])).values()].filter(Boolean)

  const q = search.trim().toLowerCase()
  const list = records.filter(r => {
    if (tutor !== 'all' && r.tutor?.id !== tutor) return false
    if (!q) return true
    const rid = receiptId(r.id)?.toLowerCase()
    return (
      rid?.includes(q) ||
      r.reference_number?.toLowerCase().includes(q) ||
      `${r.tutor?.first_name} ${r.tutor?.last_name}`.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q)
    )
  })

  const total = list.reduce((s, r) => s + (r.amount_cents || 0), 0)

  const thStyle = { padding: '11px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>

  return (
    <>
      {/* Search + filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input
            className="input"
            placeholder="Search receipt ID, reference, tutor, notes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32, width: '100%' }}
          />
        </div>
        <select className="input" value={tutor} onChange={e => setTutor(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
          <option value="all">All tutors</option>
          {tutorOptions.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
        </select>
        <span className="chip chip-line">{list.length} record{list.length !== 1 ? 's' : ''} · {fmtMoney(total / 100)} total</span>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Receipt ID</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Tutor</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Method</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Reference / Tx ID</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Period</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Paid On</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Admin</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setDetail(r)}
                  style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, background: '#e7effe', color: '#2563eb', padding: '3px 8px', borderRadius: 5, letterSpacing: '.05em' }}>
                      #{receiptId(r.id)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {r.tutor?.id
                      ? <button onClick={e => { e.stopPropagation(); navigate(`/admin/tutors?open=${r.tutor.id}`) }} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 600, fontSize: 13, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit', textAlign: 'left' }}>{r.tutor.first_name} {r.tutor.last_name}</button>
                      : <div style={{ fontWeight: 600, fontSize: 13 }}>{r.tutor?.first_name} {r.tutor?.last_name}</div>}
                    <div style={{ color: 'var(--text3)', fontSize: 11.5 }}>{r.tutor?.email}</div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#0f9b8e', whiteSpace: 'nowrap' }}>
                    {fmtMoney(r.amount_cents / 100)}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text2)', fontSize: 13 }}>{fmtMethod(r.method)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    {r.reference_number
                      ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)' }}>{r.reference_number}</span>
                      : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {r.period_start && r.period_end
                      ? `${fmtDate(r.period_start, { month: 'short', day: 'numeric' })} – ${fmtDate(r.period_end, { month: 'short', day: 'numeric', year: 'numeric' })}`
                      : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text3)', fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDate(r.paid_at)}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap' }}>{r.admin?.first_name} {r.admin?.last_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            {search || tutor !== 'all' ? 'No records match your search.' : 'No payment records yet.'}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <Modal open onClose={() => setDetail(null)} width={500}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Payment Receipt</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Full transaction details</div>
            </div>
            <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', display: 'flex' }}><X size={18} /></button>
          </div>
          {[
            ['Receipt ID',           <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>#{receiptId(detail.id)}</span>],
            ['Full Payout ID',       <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)', wordBreak: 'break-all' }}>{detail.id}</span>],
            ['Tutor',                `${detail.tutor?.first_name} ${detail.tutor?.last_name} — ${detail.tutor?.email}`],
            ['Amount',               <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: '#0f9b8e' }}>{fmtMoney(detail.amount_cents / 100)} {(detail.currency || 'USD').toUpperCase()}</span>],
            ['Method',               fmtMethod(detail.method)],
            detail.reference_number && ['Reference / Transaction ID', <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{detail.reference_number}</span>],
            ['Date Paid',            fmtDate(detail.paid_at)],
            (detail.period_start || detail.period_end) && ['Pay Period', `${fmtDate(detail.period_start)} – ${fmtDate(detail.period_end)}`],
            detail.notes && ['Notes',  detail.notes],
            ['Processed By',         `${detail.admin?.first_name} ${detail.admin?.last_name}`],
          ].filter(Boolean).map(([label, value], i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', gap: 14 }}>
              <div style={{ width: 168, flexShrink: 0, fontSize: 13, color: 'var(--text3)' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
            </div>
          ))}
        </Modal>
      )}
    </>
  )
}

// ── Log Detail Modal ────────────────────────────────────────────
function LogDetailModal({ log, onClose }) {
  if (!log) return null
  const nv = log.new_value || {}
  const ov = log.old_value || {}
  const actor  = log.actor
  const target = log.target

  const titleMap = {
    'credits.add':                    'Credits Added',
    'credits.deduct':                 'Credits Deducted',
    'module_credit.refunded':         'Module Credit Refund',
    'payroll.pay_rate':               'Pay Rate Change',
    'payment.refund':                 'Payment Refund',
    'payroll.bulk_pay':               'Bulk Payroll',
    'payroll.session.paid':           'Session Payment',
    'payroll.weekly.confirmed':       'Weekly Payment Confirmed',
    'user.suspended':                 'User Suspended',
    'user.reactivated':               'User Reactivated',
    'user.deleted':                   'User Deleted',
    'user.tutor_assigned':            'Tutor Assigned to Student',
    'payment.refunded':               'Payment Refunded',
    'tutor.approved':                 'Tutor Approved',
    'tutor.rejected':                 'Tutor Rejected',
    'tutor.course_assigned':          'Tutor Assigned to Course',
    'tutor.course_removed':           'Tutor Removed from Course',
    'tutor.enrollment_assigned':      'Tutor Assigned to Enrollment',
    'tutor.module_assigned':          'Tutor Assigned to Module',
    'tutor.module_removed':           'Tutor Removed from Module',
    'tutor.module_enrollment_assigned': 'Tutor Assigned to Module Enrollment',
    'meeting.created':                'Meeting Link Posted',
    'notification.broadcast':         'Notification Broadcast',
    'course.created':                 'Course Created',
    'course.updated':                 'Course Updated',
    'course.published':               'Course Published',
    'course.unpublished':             'Course Unpublished',
    'course.deleted':                 'Course Deleted',
    'course_module.created':          'Course Module Created',
    'course_module.updated':          'Course Module Updated',
    'course_module.deleted':          'Course Module Deleted',
    'module.created':                 'Module Created',
    'module.updated':                 'Module Updated',
    'module.published':               'Module Published',
    'module.unpublished':             'Module Unpublished',
    'plan.created':                   'Plan Created',
    'plan.updated':                   'Plan Updated',
    'plan.deleted':                   'Plan Deleted',
    'plan.recommended':               'Plan Set as Recommended',
    'pricing_plan.upserted':          'Pricing Plan Updated',
  }

  const fmtUser = u => u ? `${u.first_name} ${u.last_name} — ${u.email}` : '—'
  const fmtRate = cents => cents != null ? `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr` : '—'
  const fmtDollars = cents => `$${((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const rows = []

  if (log.action === 'credits.add' || log.action === 'credits.deduct') {
    rows.push(['Student',       nv.student_name || fmtUser(target)])
    if (nv.student_email || target?.email) rows.push(['Student Email', nv.student_email || target?.email])
    if (nv.module_name) rows.push(['Module', nv.module_name])
    rows.push(['Credits ' + (log.action === 'credits.add' ? 'Added' : 'Deducted'), `${nv.amount} credit${nv.amount !== 1 ? 's' : ''}`])
    if (ov.credits_granted != null) rows.push(['Balance Before', `${ov.credits_granted - ov.credits_used} remaining of ${ov.credits_granted} granted`])
    rows.push(['Reason', nv.reason || '—'])
    if (nv.after) {
      const remaining = nv.after.credits_granted - nv.after.credits_used
      rows.push(['Balance After', `${remaining} credit${remaining !== 1 ? 's' : ''} remaining of ${nv.after.credits_granted} granted`])
    }
  } else if (log.action === 'module_credit.refunded') {
    rows.push(['Student',        nv.student_name || fmtUser(target)])
    if (nv.student_email || target?.email) rows.push(['Student Email', nv.student_email || target?.email])
    if (nv.module_name) rows.push(['Module', nv.module_name])
    rows.push(['Credits Removed', `${nv.credits_deducted} credit${nv.credits_deducted !== 1 ? 's' : ''}`])
    if (ov.credits_granted != null) rows.push(['Balance Before', `${ov.credits_granted - ov.credits_used} remaining of ${ov.credits_granted} granted`])
    if (nv.after) rows.push(['Balance After', `${nv.after.credits_granted - nv.after.credits_used} remaining of ${nv.after.credits_granted} granted`])
    rows.push(['Reason', nv.reason || '—'])
  } else if (log.action === 'payroll.pay_rate') {
    rows.push(['Tutor',         fmtUser(target)])
    if (ov.pay_rate_cents != null) rows.push(['Previous Rate', fmtRate(ov.pay_rate_cents)])
    rows.push(['New Rate',      fmtRate(nv.pay_rate_cents)])
    rows.push(['Reason',        nv.reason || '—'])
  } else if (log.action === 'payment.refund' || log.action === 'payment.refunded') {
    rows.push(['Student',         fmtUser(target)])
    rows.push(['Amount Refunded', fmtDollars(nv.amount_cents || nv.refund_amount_cents)])
    rows.push(['Reason',          nv.reason || '—'])
    if (nv.stripe_refund_id) rows.push(['Stripe Refund ID', nv.stripe_refund_id])
    if (nv.affected_modules?.length) rows.push(['Modules Affected', nv.affected_modules.join(', ')])
  } else if (log.action === 'payroll.bulk_pay') {
    rows.push(['Tutor',         nv.tutor_name || '—'])
    if (nv.tutor_email) rows.push(['Tutor Email', nv.tutor_email])
    rows.push(['Sessions Paid', `${nv.count}`])
    if (nv.total_pay_cents != null) rows.push(['Total Paid',   fmtDollars(nv.total_pay_cents)])
    if (nv.pay_rate_cents  != null) rows.push(['Rate Applied', fmtRate(nv.pay_rate_cents)])
  } else if (log.action === 'payroll.session.paid') {
    rows.push(['Amount Paid', fmtDollars(nv.pay_cents)])
  } else if (log.action === 'user.suspended' || log.action === 'user.reactivated') {
    rows.push(['User',       nv.user_name  || fmtUser(target)])
    rows.push(['Email',      nv.user_email || target?.email || '—'])
    if (nv.user_role) rows.push(['Role', nv.user_role])
    if (ov.suspended != null) rows.push(['Was Suspended', ov.suspended ? 'Yes' : 'No'])
    if (nv.reason) rows.push(['Reason', nv.reason])
  } else if (log.action === 'user.deleted') {
    rows.push(['Name',      nv.user_name  || '—'])
    rows.push(['Email',     nv.user_email || '—'])
    rows.push(['Role',      nv.user_role  || '—'])
    if (nv.joined_at) rows.push(['Joined', new Date(nv.joined_at).toLocaleDateString('en-US', { dateStyle: 'medium' })])
    rows.push(['User ID',   log.entity_id || '—'])
  } else if (log.action === 'user.tutor_assigned') {
    rows.push(['Student',       nv.student_name  || fmtUser(target)])
    rows.push(['Student Email', nv.student_email || target?.email || '—'])
    rows.push(['Tutor',         nv.tutor_name    || '—'])
    rows.push(['Tutor Email',   nv.tutor_email   || '—'])
    if (nv.start_date) rows.push(['Start Date', new Date(nv.start_date).toLocaleDateString('en-US', { dateStyle: 'medium' })])
    if (nv.notes) rows.push(['Notes', nv.notes])
  } else if (log.action === 'tutor.approved' || log.action === 'tutor.rejected') {
    rows.push(['Tutor',  nv.tutor_name || fmtUser(target)])
    rows.push(['Email',  nv.email || target?.email || '—'])
  } else if (log.action === 'tutor.course_assigned' || log.action === 'tutor.course_removed') {
    rows.push(['Tutor',      nv.tutor_name  || fmtUser(target)])
    rows.push(['Tutor Email', nv.tutor_email || '—'])
    rows.push(['Course ID',  nv.course_id   || '—'])
  } else if (log.action === 'tutor.enrollment_assigned') {
    rows.push(['Student',       nv.student_name  || fmtUser(target)])
    rows.push(['Student Email', nv.student_email || target?.email || '—'])
    rows.push(['Tutor',         nv.tutor_name    || '—'])
    rows.push(['Tutor Email',   nv.tutor_email   || '—'])
  } else if (log.action === 'tutor.module_assigned' || log.action === 'tutor.module_removed') {
    rows.push(['Tutor',       nv.tutor_name  || fmtUser(target)])
    rows.push(['Tutor Email', nv.tutor_email || target?.email || '—'])
    rows.push(['Module',      nv.module_name || '—'])
  } else if (log.action === 'tutor.module_enrollment_assigned') {
    rows.push(['Student',       nv.student_name  || fmtUser(target)])
    rows.push(['Student Email', nv.student_email || target?.email || '—'])
    rows.push(['Tutor',         nv.tutor_name    || '—'])
    rows.push(['Tutor Email',   nv.tutor_email   || '—'])
    rows.push(['Module',        nv.module_name   || '—'])
  } else if (log.action === 'meeting.created') {
    rows.push(['Title', nv.title || '—'])
    rows.push(['Link',  nv.link  || '—'])
    if (nv.course_id) rows.push(['Course ID', nv.course_id])
  } else if (log.action === 'notification.broadcast') {
    rows.push(['Audience',   nv.audience || '—'])
    rows.push(['Subject',    nv.subject  || '—'])
    rows.push(['Recipients', `${nv.recipient_count ?? '—'}`])
  } else if (log.action === 'course.created' || log.action === 'course.updated') {
    if (ov.title && ov.title !== nv.title) rows.push(['Old Title', ov.title])
    rows.push(['Title',    nv.title || '—'])
    rows.push(['Slug',     nv.slug  || '—'])
    if (nv.category) rows.push(['Category', nv.category])
  } else if (log.action === 'course.published' || log.action === 'course.unpublished') {
    rows.push(['Course', nv.title || '—'])
  } else if (log.action === 'course.deleted') {
    rows.push(['Course Title', nv.title || '—'])
  } else if (log.action === 'course_module.created' || log.action === 'course_module.updated' || log.action === 'course_module.deleted') {
    rows.push(['Module Title', nv.title || '—'])
  } else if (log.action === 'module.created' || log.action === 'module.updated' || log.action === 'module.published' || log.action === 'module.unpublished') {
    if (ov.name && ov.name !== nv.name) rows.push(['Old Name', ov.name])
    rows.push(['Name',   nv.name   || '—'])
    if (nv.status) rows.push(['Status', nv.status])
  } else if (log.action === 'plan.created' || log.action === 'plan.updated' || log.action === 'plan.deleted' || log.action === 'plan.recommended') {
    if (ov.name && ov.name !== nv.name) rows.push(['Old Name', ov.name])
    rows.push(['Name',   nv.name   || '—'])
    if (nv.status) rows.push(['Status', nv.status])
    if (nv.is_recommended != null) rows.push(['Recommended', nv.is_recommended ? 'Yes' : 'No'])
  } else if (log.action === 'pricing_plan.upserted') {
    rows.push(['Plan Type', nv.plan_type || '—'])
    rows.push(['Price',     fmtDollars(nv.price_cents)])
  }

  rows.push(['Performed By', fmtUser(actor)])
  rows.push(['Date & Time',  new Date(log.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })])

  return (
    <Modal open onClose={onClose} width={480}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>
          {titleMap[log.action] || log.action}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', display: 'flex' }}><X size={18} /></button>
      </div>
      <div>
        {rows.map(([label, value], i) => (
          <div key={i} style={{ display: 'flex', padding: '10px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', gap: 12 }}>
            <div style={{ width: 148, flexShrink: 0, color: 'var(--text3)', fontSize: 13 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-all' }}>{value}</div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Admin Certifications ────────────────────────────────────────
function AdminCertifications() {
  const navigate = useNavigate()
  const [certs,      setCerts]      = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search,     setSearch]     = useState('')
  const [searchVal,  setSearchVal]  = useState('')
  const [issueModal, setIssueModal] = useState(null) // cert being issued
  const [rejectModal,setRejectModal]= useState(null) // cert being rejected
  const [form,       setForm]       = useState({ pdf_url: '', admin_notes: '', issued_date: '' })
  const [saving,     setSaving]     = useState(false)
  const [backfilling,setBackfilling]= useState(false)

  const runBackfill = async () => {
    setBackfilling(true)
    try {
      const r = await api.post('/admin/certifications/backfill')
      const { created, message } = r.data.data
      toast.success(message)
      if (created > 0) load()
    } catch { toast.error('Backfill failed') } finally { setBackfilling(false) }
  }

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (search)       params.set('search', search)
    api.get(`/admin/certifications?${params}`)
      .then(r => { setCerts(r.data.data?.certifications || []); setTotal(r.data.data?.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [statusFilter, search])

  useEffect(load, [load])

  const openIssue = cert => { setIssueModal(cert); setForm({ pdf_url: cert.pdf_url || '', admin_notes: cert.admin_notes || '', issued_date: new Date().toISOString().slice(0,10) }) }
  const openReject = cert => { setRejectModal(cert); setForm({ admin_notes: '' }) }

  const handleIssue = async () => {
    setSaving(true)
    try {
      await api.patch(`/admin/certifications/${issueModal.id}/issue`, form)
      toast.success('Certificate issued')
      setIssueModal(null)
      load()
    } catch { toast.error('Failed to issue') } finally { setSaving(false) }
  }

  const handleReject = async (revoke = false) => {
    setSaving(true)
    try {
      await api.patch(`/admin/certifications/${rejectModal.id}/reject`, { ...form, revoke })
      toast.success(revoke ? 'Certificate revoked' : 'Certification rejected')
      setRejectModal(null)
      load()
    } catch { toast.error('Action failed') } finally { setSaving(false) }
  }

  const STATUS_META = {
    pending:        { label: 'Pending',          color: '#d97706', bg: '#fef3c7' },
    tutor_approved: { label: 'Tutor Approved',   color: '#2563eb', bg: '#dbeafe' },
    approved:       { label: 'Issued',           color: '#059669', bg: '#d1fae5' },
    rejected:       { label: 'Rejected',         color: '#dc2626', bg: '#fee2e2' },
    revoked:        { label: 'Revoked',          color: '#6b7280', bg: '#f3f4f6' },
  }

  const STATUS_OPTIONS = [
    { value: '',               label: 'All statuses' },
    { value: 'pending',        label: 'Pending' },
    { value: 'tutor_approved', label: 'Tutor Approved' },
    { value: 'approved',       label: 'Issued' },
    { value: 'rejected',       label: 'Rejected' },
    { value: 'revoked',        label: 'Revoked' },
  ]

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ display:'flex', flex:1, minWidth:200, background:'#fff', border:'1.5px solid var(--border)', borderRadius:10, alignItems:'center', padding:'0 12px', gap:8 }}>
          <Search size={15} style={{ color:'var(--text3)', flexShrink:0 }} />
          <input
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setSearch(searchVal)}
            placeholder="Search student or module…"
            style={{ border:'none', outline:'none', padding:'9px 0', fontSize:13.5, flex:1, background:'transparent', fontFamily:'inherit' }}
          />
          {searchVal && <button onClick={() => { setSearchVal(''); setSearch('') }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', display:'flex' }}><X size={14} /></button>}
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ border:'1.5px solid var(--border)', borderRadius:10, padding:'9px 12px', fontSize:13.5, background:'#fff', fontFamily:'inherit', cursor:'pointer' }}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button className="btn btn-primary btn-sm" onClick={runBackfill} disabled={backfilling} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
          {backfilling ? <><span className="spinner" style={{ width:13, height:13 }} /> Checking…</> : <><Award size={14} /> Check eligibility</>}
        </button>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
          <span className="spinner" role="status" aria-label="Loading" style={{ width:28, height:28 }} />
        </div>
      ) : !certs.length ? (
        <div style={{ textAlign:'center', padding:'64px 24px', color:'var(--text3)' }}>
          <Award size={40} strokeWidth={1.4} style={{ marginBottom:14, opacity:.5 }} />
          <div style={{ fontWeight:700, fontSize:16, color:'var(--text2)', marginBottom:6 }}>No certifications found</div>
          <div style={{ fontSize:14 }}>Tutor-approved certifications waiting for issuance will appear here.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontSize:13, color:'var(--text3)', marginBottom:4 }}>{total} certification{total !== 1 ? 's' : ''}</div>
          {certs.map(cert => {
            const meta    = STATUS_META[cert.status] || STATUS_META.pending
            const subject = cert.module?.name || cert.course?.title || 'Module'
            const studentName = cert.student ? `${cert.student.first_name} ${cert.student.last_name}` : '—'
            const tutor   = cert.tutor   ? `${cert.tutor.first_name} ${cert.tutor.last_name}` : '—'
            return (
              <div key={cert.id} className="card" style={{ padding:'18px 20px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <div style={{ width:44, height:44, borderRadius:13, background:'var(--accent-light)', color:'var(--accent)', display:'grid', placeItems:'center', flexShrink:0 }}>
                  <Award size={20} strokeWidth={1.8} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>
                    {cert.student?.id
                      ? <button onClick={() => navigate(`/admin/students?open=${cert.student.id}`)} style={{ background:'none', border:'none', padding:0, fontWeight:700, fontSize:14, cursor:'pointer', color:'var(--accent)', fontFamily:'inherit', textAlign:'left' }}>{studentName}</button>
                      : studentName}
                  </div>
                  <div style={{ fontSize:12.5, color:'var(--text3)', marginTop:2 }}>
                    {subject} · Mentor: {cert.tutor?.id ? <button onClick={() => navigate(`/admin/tutors?open=${cert.tutor.id}`)} style={{ background:'none', border:'none', padding:0, fontWeight:600, cursor:'pointer', color:'var(--accent)', fontFamily:'inherit', fontSize:'inherit' }}>{tutor}</button> : tutor}
                    {cert.completion_date && <span style={{ marginLeft:10 }}>Completed {new Date(cert.completion_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>}
                    {cert.issued_date && <span style={{ marginLeft:10 }}>Issued {new Date(cert.issued_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>}
                  </div>
                  {cert.tutor_notes && <div style={{ fontSize:12, color:'var(--text3)', marginTop:4, fontStyle:'italic' }}>Mentor note: {cert.tutor_notes}</div>}
                </div>
                <span style={{ padding:'4px 11px', borderRadius:999, fontSize:12, fontWeight:700, background:meta.bg, color:meta.color, flexShrink:0 }}>{meta.label}</span>
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  {['pending','tutor_approved'].includes(cert.status) && (
                    <button className="btn btn-primary btn-sm" onClick={() => openIssue(cert)} style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                      <BadgeCheck size={13} /> Issue
                    </button>
                  )}
                  {['pending','tutor_approved'].includes(cert.status) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openReject(cert)} style={{ display:'inline-flex', alignItems:'center', gap:5, color:'var(--danger)' }}>
                      <X size={13} /> Reject
                    </button>
                  )}
                  {cert.status === 'approved' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openReject(cert)} style={{ display:'inline-flex', alignItems:'center', gap:5, color:'var(--danger)' }}>
                      <Ban size={13} /> Revoke
                    </button>
                  )}
                  {cert.pdf_url && (
                    <a href={cert.pdf_url} target="_blank" rel="noopener noreferrer"
                      style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:12.5, fontWeight:600, color:'var(--text2)', textDecoration:'none' }}>
                      <Download size={13} /> PDF
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Issue modal */}
      {issueModal && (
        <Modal open onClose={() => setIssueModal(null)} width={460}>
          <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>Issue Certificate</div>
          <div style={{ fontSize:13, color:'var(--text3)', marginBottom:20 }}>
            {issueModal.student?.first_name} {issueModal.student?.last_name} — {issueModal.module?.name || issueModal.course?.title}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:12.5, fontWeight:600, color:'var(--text2)', display:'block', marginBottom:5 }}>Issued Date</label>
              <input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))}
                style={{ width:'100%', borderRadius:9, border:'1.5px solid var(--border)', padding:'9px 12px', fontSize:13.5, fontFamily:'inherit', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:12.5, fontWeight:600, color:'var(--text2)', display:'block', marginBottom:5 }}>PDF URL <span style={{ fontWeight:400, color:'var(--text3)' }}>(optional)</span></label>
              <input type="url" value={form.pdf_url} onChange={e => setForm(f => ({ ...f, pdf_url: e.target.value }))}
                placeholder="https://…"
                style={{ width:'100%', borderRadius:9, border:'1.5px solid var(--border)', padding:'9px 12px', fontSize:13.5, fontFamily:'inherit', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:12.5, fontWeight:600, color:'var(--text2)', display:'block', marginBottom:5 }}>Admin Notes <span style={{ fontWeight:400, color:'var(--text3)' }}>(optional)</span></label>
              <textarea value={form.admin_notes} onChange={e => setForm(f => ({ ...f, admin_notes: e.target.value }))}
                rows={3} placeholder="Internal notes…"
                style={{ width:'100%', borderRadius:9, border:'1.5px solid var(--border)', padding:'9px 12px', fontSize:13.5, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setIssueModal(null)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleIssue} disabled={saving} style={{ minWidth:100 }}>
              {saving ? 'Issuing…' : 'Issue Certificate'}
            </button>
          </div>
        </Modal>
      )}

      {/* Reject/revoke modal */}
      {rejectModal && (
        <Modal open onClose={() => setRejectModal(null)} width={420}>
          <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>
            {rejectModal.status === 'approved' ? 'Revoke Certificate' : 'Reject Certification'}
          </div>
          <div style={{ fontSize:13, color:'var(--text3)', marginBottom:16 }}>
            {rejectModal.student?.first_name} {rejectModal.student?.last_name} — {rejectModal.module?.name || rejectModal.course?.title}
          </div>
          <textarea value={form.admin_notes} onChange={e => setForm(f => ({ ...f, admin_notes: e.target.value }))}
            rows={3} placeholder="Reason (optional)"
            style={{ width:'100%', borderRadius:9, border:'1.5px solid var(--border)', padding:'9px 12px', fontSize:13.5, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box' }} />
          <div style={{ display:'flex', gap:10, marginTop:16, justifyContent:'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setRejectModal(null)} disabled={saving}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={() => handleReject(rejectModal.status === 'approved')} disabled={saving} style={{ minWidth:90 }}>
              {saving ? 'Saving…' : rejectModal.status === 'approved' ? 'Revoke' : 'Reject'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Admin Sessions ──────────────────────────────────────────────
function AdminSessions() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('All')
  const [search, setSearch]       = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)

  const load = () =>
    api.get('/admin/sessions').then(r => setSessions(r.data.data?.sessions || [])).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const STATUS_OPTS = ['All', 'Pending Cancel', 'confirmed', 'pending', 'cancelled', 'completed']
  const filtered = sessions.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (s.student?.first_name + ' ' + s.student?.last_name).toLowerCase().includes(q) ||
      (s.tutor?.first_name + ' ' + s.tutor?.last_name).toLowerCase().includes(q) ||
      (s.subject || '').toLowerCase().includes(q)
    const matchFilter = filter === 'All'
      ? true
      : filter === 'Pending Cancel'
        ? s.cancel_requested && s.status !== 'cancelled'
        : s.status === filter
    return matchSearch && matchFilter
  })

  const pendingCount = sessions.filter(s => s.cancel_requested && s.status !== 'cancelled').length

  const fmtD = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
  return (
    <>
      {cancelTarget && (
        <AdminCancelModal
          session={cancelTarget}
          adminEmail={user?.email}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => { setCancelTarget(null); load() }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <SegTabs
          value={filter}
          onChange={setFilter}
          tabs={STATUS_OPTS.map(s => ({
            id: s,
            label: s === 'Pending Cancel' ? 'Pending Cancel' : s.charAt(0).toUpperCase() + s.slice(1),
            count: s === 'Pending Cancel' ? pendingCount : s === 'All' ? sessions.length : sessions.filter(x => x.status === s).length,
          }))}
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
            <input
              className="form-input"
              placeholder="Search student, tutor, subject…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34, height: 38 }}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>No sessions found.</div>
        ) : filtered.map((s, i) => {
          const statusColors = {
            pending:   { badge: 'badge-yellow' },
            confirmed: { badge: 'badge-green' },
            completed: { badge: 'badge-blue' },
            cancelled: { badge: 'badge-red' },
          }
          const bc = statusColors[s.status] || { badge: 'badge-gray' }
          return (
            <div key={s.id} style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              borderTop: i ? '1px solid var(--border)' : 'none',
              background: s.cancel_requested && s.status !== 'cancelled' ? '#fffbeb' : 'transparent',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span className={`badge ${bc.badge}`}>{s.status}</span>
                  {s.cancel_requested && s.status !== 'cancelled' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                      <Clock size={11} /> Student requested cancel
                    </span>
                  )}
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{s.subject}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span>{fmtD(s.scheduled_date)} · {s.start_time}–{s.end_time}</span>
                  {s.student && <span>· Student: <button onClick={() => navigate(`/admin/students?open=${s.student.id}`)} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 'inherit' }}>{s.student.first_name} {s.student.last_name}</button></span>}
                  {s.tutor && <span>· Tutor: <button onClick={() => navigate(`/admin/tutors?open=${s.tutor.id}`)} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 'inherit' }}>{s.tutor.first_name} {s.tutor.last_name}</button></span>}
                </div>
                {s.cancel_request_reason && (
                  <div style={{ fontSize: 12, color: '#92400e', marginTop: 4, fontStyle: 'italic' }}>
                    Student reason: "{s.cancel_request_reason}"
                  </div>
                )}
              </div>
              {!['cancelled', 'completed'].includes(s.status) && (
                <button
                  className="btn btn-sm"
                  style={{ color: 'var(--danger)', border: '1px solid #fca5a5', background: 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={() => setCancelTarget(s)}
                >
                  <Ban size={13} /> Cancel
                </button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Admin Cancel Modal (requires email confirmation) ────────────
function AdminCancelModal({ session, adminEmail, onClose, onCancelled }) {
  const [reason, setReason]       = useState('')
  const [emailInput, setEmail]    = useState('')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  const fmtD = d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  const submit = async () => {
    setErr('')
    if (!emailInput.trim()) { setErr('Please enter your admin email to confirm.'); return }
    setSaving(true)
    try {
      await api.patch(`/sessions/${session.id}/cancel`, { reason, admin_email: emailInput.trim() })
      onCancelled()
    } catch (e) { setErr(e.response?.data?.error || 'Failed to cancel session.') }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} width={480}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ban size={20} /> Cancel Session
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', display: 'flex' }}><X size={18} /></button>
      </div>

      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--danger)', marginBottom: 4 }}>{session.subject}</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          {fmtD(session.scheduled_date)} · {session.start_time}–{session.end_time}
        </div>
        {session.student && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Student: <strong>{session.student.first_name} {session.student.last_name}</strong></div>}
        {session.tutor && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Tutor: <strong>{session.tutor.first_name} {session.tutor.last_name}</strong></div>}
        {session.cancel_request_reason && (
          <div style={{ fontSize: 12, color: '#92400e', marginTop: 6, padding: '6px 10px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fcd34d' }}>
            Student reason: "{session.cancel_request_reason}"
          </div>
        )}
      </div>

      <div className="field" style={{ marginBottom: 16 }}>
        <label>Cancellation reason <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
        <textarea className="form-input" rows={3} placeholder="Why is this session being cancelled?" value={reason} onChange={e => setReason(e.target.value)} style={{ resize: 'none' }} />
      </div>

      <div className="field" style={{ marginBottom: 20 }}>
        <label style={{ color: 'var(--danger)' }}>Confirm with your admin email</label>
        <input
          className="form-input"
          type="email"
          placeholder={adminEmail || 'your@email.com'}
          value={emailInput}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoFocus
        />
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 5 }}>
          This prevents accidental cancellations. This action will be logged in the admin logbook.
        </div>
      </div>

      {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 14, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onClose}>Dismiss</button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, background: 'var(--danger)', borderColor: 'var(--danger)' }}
          disabled={saving || !emailInput.trim()}
          onClick={submit}
        >
          {saving ? <><span className="spinner" /> Cancelling…</> : 'Confirm cancellation'}
        </button>
      </div>
    </Modal>
  )
}

// ── Admin Logbook ───────────────────────────────────────────────
function AdminLogbook() {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('All')
  const [selected, setSelected] = useState(null)
  useEffect(() => { api.get('/admin/audit').then(r => setLogs(r.data.data?.logs || [])).catch(() => {}).finally(() => setLoading(false)) }, [])

  const types    = ['All', 'Sessions', 'Credits', 'Refunds', 'Payroll', 'Users', 'Assignments', 'Catalog']
  const typeChip = { Sessions: 'chip-alert', Credits: 'chip-soft', Refunds: 'chip-alert', Payroll: 'chip-good', Users: 'chip', Assignments: 'chip-soft', Catalog: '' }
  const typeMap  = {
    'session.cancelled':                'Sessions',
    'payment.refund':                   'Refunds',
    'payment.refunded':                 'Refunds',
    'payroll.bulk_pay':                 'Payroll',
    'payroll.session.paid':             'Payroll',
    'payroll.weekly.confirmed':         'Payroll',
    'credits.add':                      'Credits',
    'credits.deduct':                   'Credits',
    'module_credit.refunded':           'Credits',
    'payroll.pay_rate':                 'Payroll',
    'user.suspended':                   'Users',
    'user.reactivated':                 'Users',
    'user.deleted':                     'Users',
    'user.tutor_assigned':              'Assignments',
    'tutor.approved':                   'Users',
    'tutor.rejected':                   'Users',
    'tutor.course_assigned':            'Assignments',
    'tutor.course_removed':             'Assignments',
    'tutor.enrollment_assigned':        'Assignments',
    'tutor.module_assigned':            'Assignments',
    'tutor.module_removed':             'Assignments',
    'tutor.module_enrollment_assigned': 'Assignments',
    'meeting.created':                  'Catalog',
    'notification.broadcast':           'Catalog',
    'course.created':                   'Catalog',
    'course.updated':                   'Catalog',
    'course.published':                 'Catalog',
    'course.unpublished':               'Catalog',
    'course.deleted':                   'Catalog',
    'course_module.created':            'Catalog',
    'course_module.updated':            'Catalog',
    'course_module.deleted':            'Catalog',
    'module.created':                   'Catalog',
    'module.updated':                   'Catalog',
    'module.published':                 'Catalog',
    'module.unpublished':               'Catalog',
    'plan.created':                     'Catalog',
    'plan.updated':                     'Catalog',
    'plan.deleted':                     'Catalog',
    'plan.recommended':                 'Catalog',
    'pricing_plan.upserted':            'Catalog',
  }
  const list = logs.filter(l => {
    if (filter === 'All') return true
    return (typeMap[l.action] || '') === filter
  })

  const summaryOf = l => {
    const nv = l.new_value || {}
    const target = l.target
    const tname = target ? `${target.first_name} ${target.last_name}` : null
    if (l.action === 'session.cancelled')                 return `Session cancelled · ${nv.student_name || tname || ''} — ${nv.scheduled_date || ''} ${nv.start_time || ''}`
    if (l.action === 'credits.add')                      return `${nv.amount} cr added${tname ? ` · ${tname}` : ''}`
    if (l.action === 'credits.deduct')                   return `${nv.amount} cr deducted${tname ? ` · ${tname}` : ''}`
    if (l.action === 'module_credit.refunded')           return `${nv.credits_deducted} cr refunded${tname ? ` · ${tname}` : ''}`
    if (l.action === 'payroll.pay_rate')                 return `Pay rate updated${tname ? ` · ${tname}` : ''}`
    if (l.action === 'payment.refund')                   return `$${((nv.amount_cents || 0) / 100).toFixed(2)} refunded${tname ? ` · ${tname}` : ''}`
    if (l.action === 'payroll.bulk_pay')                 return `${nv.count} sessions paid · ${nv.tutor_name || ''}`
    if (l.action === 'payroll.session.paid')             return `$${((nv.pay_cents || 0) / 100).toFixed(2)} session payment`
    if (l.action === 'payroll.weekly.confirmed')         return `$${((nv.total_pay_cents || 0) / 100).toFixed(2)} weekly payment · ${nv.week_range || ''}`
    if (l.action === 'user.suspended')                   return `User suspended${tname ? ` · ${tname}` : ''}`
    if (l.action === 'user.reactivated')                 return `User reactivated${tname ? ` · ${tname}` : ''}`
    if (l.action === 'user.deleted')                     return `User deleted${nv.user_name ? ` · ${nv.user_name}` : ''}`
    if (l.action === 'tutor.approved')                   return `Tutor approved · ${nv.tutor_name || tname || ''}`
    if (l.action === 'tutor.rejected')                   return `Tutor rejected · ${nv.tutor_name || ''}`
    if (l.action === 'tutor.course_assigned')            return `Tutor assigned to course · ${nv.tutor_name || tname || ''}`
    if (l.action === 'tutor.course_removed')             return `Tutor removed from course · ${nv.tutor_name || tname || ''}`
    if (l.action === 'tutor.enrollment_assigned')        return `Tutor assigned · ${nv.tutor_name || ''} → ${nv.student_name || tname || ''}`
    if (l.action === 'tutor.module_assigned')            return `Tutor assigned to module · ${nv.tutor_name || tname || ''}`
    if (l.action === 'tutor.module_removed')             return `Tutor removed from module · ${nv.tutor_name || tname || ''}`
    if (l.action === 'tutor.module_enrollment_assigned') return `Tutor assigned · ${nv.tutor_name || ''} → ${nv.student_name || tname || ''}`
    if (l.action === 'meeting.created')                  return `Meeting posted · ${nv.title || ''}`
    if (l.action === 'notification.broadcast')           return `Broadcast sent · ${nv.subject || ''}`
    if (l.action === 'course.created')                   return `Course created · ${nv.title || ''}`
    if (l.action === 'course.updated')                   return `Course updated · ${nv.title || ''}`
    if (l.action === 'course.published')                 return `Course published · ${nv.title || ''}`
    if (l.action === 'course.unpublished')               return `Course unpublished · ${nv.title || ''}`
    if (l.action === 'course.deleted')                   return `Course deleted · ${nv.title || ''}`
    if (l.action === 'course_module.created')            return `Module created · ${nv.title || ''}`
    if (l.action === 'course_module.updated')            return `Module updated · ${nv.title || ''}`
    if (l.action === 'course_module.deleted')            return `Module deleted · ${nv.title || ''}`
    if (l.action === 'module.created')                   return `Module created · ${nv.name || ''}`
    if (l.action === 'module.updated')                   return `Module updated · ${nv.name || ''}`
    if (l.action === 'module.published')                 return `Module published · ${nv.name || ''}`
    if (l.action === 'module.unpublished')               return `Module unpublished · ${nv.name || ''}`
    if (l.action === 'plan.created')                     return `Plan created · ${nv.name || ''}`
    if (l.action === 'plan.updated')                     return `Plan updated · ${nv.name || ''}`
    if (l.action === 'plan.deleted')                     return `Plan deleted · ${nv.name || ''}`
    if (l.action === 'plan.recommended')                 return `Plan set as recommended · ${nv.name || ''}`
    if (l.action === 'pricing_plan.upserted')            return `Pricing updated · ${nv.plan_type || ''}`
    return l.action?.replace(/\./g, ' — ') || '—'
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
  return (
    <>
      <LogDetailModal log={selected} onClose={() => setSelected(null)} />
      <div style={{ marginBottom: 18 }}>
        <SegTabs value={filter} onChange={setFilter} tabs={types.map(t => ({ id: t, label: t }))} />
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {list.map((l, i) => {
          const type = typeMap[l.action] || 'Action'
          return (
            <div
              key={l.id}
              onClick={() => setSelected(l)}
              style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderTop: i ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background .12s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <span className={`chip ${typeChip[type] || 'chip'}`} style={{ minWidth: 80, justifyContent: 'center', flexShrink: 0 }}>{type}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summaryOf(l)}</div>
                {l.new_value?.reason && <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.new_value.reason}</div>}
                <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={11} /> {l.actor?.first_name} {l.actor?.last_name} · {new Date(l.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
              <ChevronRight size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            </div>
          )
        })}
        {list.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>No entries of this type.</div>}
      </div>
    </>
  )
}

// ── Support ─────────────────────────────────────────────────────
function AdminSupport() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen]       = useState(null)
  const [reply, setReply]     = useState('')
  const [sending, setSending] = useState(false)
  const [filter, setFilter]   = useState('All')

  const load = () => api.get('/admin/support-tickets').then(r => setTickets(r.data.data?.tickets || [])).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [])
  useEffect(() => { setReply('') }, [open])

  const statusFilter = { All: null, Open: 'open', Resolved: 'resolved' }
  const list = filter === 'All' ? tickets : tickets.filter(t => (t.status || '').toLowerCase() === (filter || '').toLowerCase())
  const detail = open ? tickets.find(t => t.id === open) : null

  const sendReply = async () => {
    if (!reply.trim() || !open) return
    setSending(true)
    try {
      await api.post(`/admin/support-tickets/${open}/reply`, { message: reply })
      setTickets(p => p.map(t => t.id === open ? { ...t, status: 'resolved', last_reply: reply } : t))
      setReply('')
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
    finally { setSending(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <SegTabs value={filter} onChange={v => { setFilter(v); setOpen(null) }} tabs={
          ['All', 'Open', 'Resolved'].map(s => ({ id: s, label: s, count: s === 'All' ? tickets.length : tickets.filter(t => (t.status || '').toLowerCase() === s.toLowerCase()).length }))
        } />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 1.3fr' : '1fr', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(t => (
            <button key={t.id} onClick={() => setOpen(t.id)} className="card" style={{ padding: 16, textAlign: 'left', border: open === t.id ? '1.5px solid var(--accent)' : '1px solid var(--border)', cursor: 'pointer', background: 'none', fontFamily: 'inherit', transition: 'all .15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className={`chip ${t.status === 'open' ? 'chip-alert' : 'chip-good'}`} style={{ padding: '1px 9px', fontSize: 11 }}>{t.status || 'open'}</span>
                <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-display)', fontSize: 11.5 }}>#{t.id?.slice(0, 8).toUpperCase()}</span>
                <span className="chip chip-line" style={{ marginLeft: 'auto', padding: '1px 8px', fontSize: 11 }}>{t.category?.replace(/_/g, ' ')}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.title || t.subject}</div>
              <div style={{ color: 'var(--text3)', fontSize: 12.5, marginTop: 2 }}>{t.user?.first_name} {t.user?.last_name} · {fmtDate(t.created_at, { month: 'short', day: 'numeric' })}</div>
            </button>
          ))}
          {list.length === 0 && <EmptyState text="No tickets in this category." />}
        </div>

        {detail && (
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <span className={`chip ${detail.status === 'open' ? 'chip-alert' : 'chip-good'}`}>{detail.status || 'open'}</span>
              <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-display)', fontSize: 12 }}>#{detail.id?.slice(0, 8).toUpperCase()}</span>
            </div>
            <h3 style={{ fontSize: 18, marginTop: 8, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{detail.title || detail.subject}</h3>
            <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>{detail.user?.first_name} {detail.user?.last_name} · {detail.user?.email}</div>
            <p style={{ fontSize: 14.5, color: 'var(--text2)', lineHeight: 1.6, marginTop: 16, padding: '14px 16px', background: '#fbfaf7', borderRadius: 12 }}>
              {detail.message || detail.messages?.[0]?.content || ''}
            </p>
            {detail.last_reply ? (
              <div style={{ marginTop: 16 }}>
                <span className="chip chip-good" style={{ marginBottom: 8 }}><Check size={13} /> Replied</span>
                <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, padding: '14px 16px', background: 'var(--accent-soft, #f4f3fe)', borderRadius: 12, border: '1px solid var(--accent-light)', marginTop: 8 }}>{detail.last_reply}</p>
              </div>
            ) : (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Reply in-app (shows in their Support tab)</div>
                <textarea className="form-input" placeholder="Write your reply…" value={reply} onChange={e => setReply(e.target.value)} style={{ minHeight: 100, resize: 'vertical' }} />
                <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={!reply.trim() || sending} onClick={sendReply}>
                  {sending ? <><span className="spinner" /> Sending…</> : <><Send size={16} /> Send reply</>}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── FAQs ────────────────────────────────────────────────────────
// ── Email Templates ─────────────────────────────────────────────
function AdminEmailTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState(null)

  const load = () => {
    api.get('/admin/email-templates')
      .then(r => setTemplates(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openEdit = tpl => setEditing({ ...tpl, steps: Array.isArray(tpl.steps) ? tpl.steps.map(s => ({ ...s })) : [] })

  const save = async () => {
    try {
      const r = await api.patch(`/admin/email-templates/${editing.key}`, {
        name: editing.name,
        subject: editing.subject,
        preheader: editing.preheader,
        heading: editing.heading,
        intro: editing.intro,
        steps: editing.steps,
        cta_label: editing.cta_label,
      })
      setTemplates(p => p.map(t => t.key === editing.key ? r.data.data : t))
      setEditing(null)
      toast.success('Template saved')
    } catch (e) { toast.error(e.response?.data?.error || 'Save failed') }
  }

  const setField = (k, v) => setEditing(p => ({ ...p, [k]: v }))
  const setStep  = (i, k, v) => setEditing(p => { const steps = [...p.steps]; steps[i] = { ...steps[i], [k]: v }; return { ...p, steps } })
  const addStep  = () => setEditing(p => ({ ...p, steps: [...p.steps, { title: '', body: '' }] }))
  const removeStep = i => setEditing(p => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }))

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>

  const Placeholder = () => (
    <code style={{ background: 'var(--bg2)', padding: '1px 7px', borderRadius: 5, fontSize: 12.5, fontWeight: 600 }}>{'{{firstName}}'}</code>
  )

  return (
    <div style={{ maxWidth: 820 }}>
      <p style={{ color: 'var(--text3)', fontSize: 13.5, marginBottom: 20 }}>
        Edit the content of automated welcome emails. Use <Placeholder /> anywhere to insert the recipient's first name.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {templates.map(t => (
          <div key={t.key} className="card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Mail size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)' }}>{t.name}</div>
                <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 3 }}>Subject: {t.subject}</div>
                <div style={{ color: 'var(--text2)', fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>{t.intro?.slice(0, 130)}{(t.intro?.length || 0) > 130 ? '…' : ''}</div>
                {Array.isArray(t.steps) && t.steps.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {t.steps.map((s, i) => (
                      <span key={i} style={{ padding: '2px 10px', borderRadius: 999, background: 'var(--bg2)', fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{i + 1}. {s.title}</span>
                    ))}
                  </div>
                )}
                {t.updater && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                    Last edited by {t.updater.first_name} {t.updater.last_name}
                  </div>
                )}
              </div>
              <button className="btn btn-ghost" style={{ padding: '6px 14px', height: 'auto', flexShrink: 0 }} onClick={() => openEdit(t)}>Edit</button>
            </div>
          </div>
        ))}
        {templates.length === 0 && <EmptyState text="No email templates found." />}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} width={680}>
        {editing && (
          <div>
            <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>{editing.name}</h2>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 20 }}>
              Use <Placeholder /> anywhere to insert the recipient's first name.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label>Subject line</label>
                <input className="input" value={editing.subject} onChange={e => setField('subject', e.target.value)} />
              </div>
              <div className="field">
                <label>Preview text <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(shown in inbox before opening)</span></label>
                <input className="input" value={editing.preheader || ''} onChange={e => setField('preheader', e.target.value)} />
              </div>
              <div className="field">
                <label>Heading</label>
                <input className="input" value={editing.heading} onChange={e => setField('heading', e.target.value)} />
              </div>
              <div className="field">
                <label>Intro paragraph</label>
                <textarea className="form-input" value={editing.intro} onChange={e => setField('intro', e.target.value)} style={{ minHeight: 90, resize: 'vertical' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Steps</label>
                  <button className="btn btn-ghost btn-sm" onClick={addStep}><Plus size={14} /> Add step</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {editing.steps.map((step, i) => (
                    <div key={i} style={{ background: 'var(--bg2)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input className="input" value={step.title} onChange={e => setStep(i, 'title', e.target.value)} placeholder="Step title" style={{ fontSize: 14 }} />
                        <input className="input" value={step.body || ''} onChange={e => setStep(i, 'body', e.target.value)} placeholder="Step description (optional)" style={{ fontSize: 13 }} />
                      </div>
                      <button onClick={() => removeStep(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex', marginTop: 2 }}><X size={16} /></button>
                    </div>
                  ))}
                  {editing.steps.length === 0 && (
                    <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>No steps — click "Add step" to add numbered instructions.</div>
                  )}
                </div>
              </div>
              <div className="field">
                <label>Button label</label>
                <input className="input" value={editing.cta_label} onChange={e => setField('cta_label', e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 22, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save template</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function AdminFaqs() {
  const [faqs, setFaqs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit]     = useState(null) // { id?, q, a, isNew }

  const load = () => api.get('/faqs/admin').then(r => setFaqs(r.data.data?.faqs || [])).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!edit?.question && !edit?.q) return
    const q = edit.question || edit.q, a = edit.answer || edit.a
    try {
      if (edit.isNew) {
        const r = await api.post('/faqs', { question: q, answer: a, published: true })
        setFaqs(p => [...p, r.data.data?.faq || { id: Date.now(), question: q, answer: a }])
      } else {
        await api.put(`/faqs/${edit.id}`, { question: q, answer: a, published: true })
        setFaqs(p => p.map(f => f.id === edit.id ? { ...f, question: q, answer: a } : f))
      }
      setEdit(null)
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
  }
  const del = async id => {
    if (!(await confirmDialog('Delete this FAQ?'))) return
    await api.delete(`/faqs/${id}`).catch(console.error)
    setFaqs(p => p.filter(f => f.id !== id))
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>
  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: 'var(--text3)', fontSize: 13.5 }}>{faqs.length} questions shown on the public landing page</span>
        <button className="btn btn-primary btn-sm" onClick={() => setEdit({ isNew: true, question: '', answer: '' })}><Plus size={16} /> Add FAQ</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {faqs.map(f => (
          <div key={f.id} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>{f.question || f.q}</div>
                <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.55, marginTop: 6 }}>{f.answer || f.a}</p>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost" style={{ padding: 8, height: 'auto' }} onClick={() => setEdit({ ...f, question: f.question || f.q, answer: f.answer || f.a })}>Edit</button>
                <button className="btn btn-ghost" style={{ padding: 8, height: 'auto', color: 'var(--danger)' }} onClick={() => del(f.id)}><X size={16} /></button>
              </div>
            </div>
          </div>
        ))}
        {faqs.length === 0 && <EmptyState text="No FAQs yet. Click 'Add FAQ' to create one." />}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} width={540}>
        {edit && (
          <div>
            <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{edit.isNew ? 'Add FAQ' : 'Edit FAQ'}</h2>
            <div className="field" style={{ marginTop: 18 }}>
              <label>Question</label>
              <input className="input" value={edit.question || ''} onChange={e => setEdit(p => ({ ...p, question: e.target.value }))} placeholder="e.g. Do credits expire?" />
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Answer</label>
              <textarea className="form-input" value={edit.answer || ''} onChange={e => setEdit(p => ({ ...p, answer: e.target.value }))} style={{ minHeight: 110, resize: 'vertical' }} placeholder="Write the answer shown to visitors…" />
            </div>
            <button className="btn btn-primary btn-full btn-lg" style={{ marginTop: 18 }} disabled={!edit.question || !edit.answer} onClick={save}>
              {edit.isNew ? 'Add to landing page' : 'Save changes'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Broadcast ───────────────────────────────────────────────────
function AdminBroadcast() {
  const [audience, setAudience] = useState('students')
  const [subject, setSubject]   = useState('')
  const [body, setBody]         = useState('')
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [history, setHistory]   = useState([])

  useEffect(() => { api.get('/notifications/history').then(r => setHistory(r.data.data?.notifications || [])).catch(() => {}) }, [])

  const send = async () => {
    if (!subject || !body) return
    setSending(true)
    try {
      await api.post('/admin/notifications/broadcast', { audience, subject, body })
      setSent(true); setTimeout(() => setSent(false), 3000)
      setSubject(''); setBody('')
      api.get('/notifications/history').then(r => setHistory(r.data.data?.notifications || [])).catch(() => {})
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to send') }
    finally { setSending(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }} className="bc-grid">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Megaphone size={18} style={{ color: 'var(--accent)' }} /> Compose notification
        </div>
        {sent && <div className="alert alert-success" style={{ marginBottom: 14 }}>Notification sent!</div>}
        <div className="field">
          <label>Audience</label>
          <select className="select" value={audience} onChange={e => setAudience(e.target.value)}>
            <option value="students">All Students</option>
            <option value="tutors">All Tutors</option>
            <option value="all">All Users</option>
          </select>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Subject</label>
          <input className="input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Short headline" />
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Message</label>
          <textarea className="form-input" value={body} onChange={e => setBody(e.target.value)} style={{ minHeight: 120, resize: 'vertical' }} placeholder="What do you want to announce?" />
        </div>
        <button className="btn btn-primary btn-full" style={{ marginTop: 18 }} disabled={!subject || !body || sending} onClick={send}>
          {sending ? <><span className="spinner" /> Sending…</> : <><Send size={16} /> Send to {audience}</>}
        </button>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14, fontFamily: 'var(--font-display)' }}>Recently sent</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {history.map((n, i) => (
            <div key={n.id || i} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="chip chip-soft">{n.type || 'info'}</span>
                <span style={{ color: 'var(--text3)', fontSize: 12, marginLeft: 'auto' }}>{fmtDate(n.created_at, { month: 'short', day: 'numeric' })}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 8 }}>{n.title}</div>
              <div style={{ color: 'var(--text3)', fontSize: 12.5, marginTop: 3 }}>{n.message?.slice(0, 80)}…</div>
            </div>
          ))}
          {history.length === 0 && <EmptyState text="No notifications sent yet." />}
        </div>
      </div>
    </div>
  )
}

// ── Analytics ───────────────────────────────────────────────────
const AN_PRESETS = [
  { label: '7D',  days: 7   },
  { label: '30D', days: 30  },
  { label: '90D', days: 90  },
  { label: '6M',  days: 180 },
  { label: '1Y',  days: 365 },
  { label: 'All', days: 0   },
]

function BarChart({ data, height = 160, getGross, getRefunded, getLabel, getTooltip }) {
  const maxVal = Math.max(...data.map(d => (getGross ? getGross(d) : d.value || 0)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height, paddingTop: 10 }}>
      {data.map((d, i) => {
        const gross    = getGross    ? getGross(d)    : (d.value || 0)
        const refunded = getRefunded ? getRefunded(d) : 0
        const tip      = getTooltip  ? getTooltip(d)  : String(gross)
        const label    = getLabel    ? getLabel(d)    : ''
        const pct      = Math.max((gross / maxVal) * 100, gross > 0 ? 2 : 0)
        const refPct   = gross > 0 ? Math.min((refunded / gross) * 100, 100) : 0
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
            <div title={tip} style={{ width: '62%', height: `${pct}%`, background: 'linear-gradient(180deg,var(--accent),#7c5cff)', borderRadius: '5px 5px 0 0', minHeight: gross > 0 ? 4 : 0, transition: 'height .4s', position: 'relative', overflow: 'hidden' }}>
              {refunded > 0 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${refPct}%`, background: 'rgba(239,68,68,0.55)', borderRadius: '0 0 5px 5px' }} />}
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 11, fontWeight: 600 }}>{label}</div>
          </div>
        )
      })}
    </div>
  )
}

function HBarChart({ data, getName, getValue, getRight, maxVal, tints }) {
  const max = maxVal || Math.max(...data.map(d => getValue(d)), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d, i) => {
        const v = getValue(d)
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 150, fontSize: 13, fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getName(d)}</span>
            <div style={{ flex: 1, height: 20, background: 'var(--bg2)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: tints ? TINTS[tintOf(i)].fg : 'var(--accent)', borderRadius: 5, transition: 'width .5s', opacity: 0.85 }} />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, width: 40, textAlign: 'right' }}>{getRight ? getRight(d) : v}</span>
          </div>
        )
      })}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={17} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)' }}>{title}</span>
      </div>
      {sub && <span style={{ color: 'var(--text3)', fontSize: 13 }}>{sub}</span>}
    </div>
  )
}

function AdminAnalytics() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset]   = useState(4) // 1Y default

  const load = (days) => {
    setLoading(true)
    const q = days === 0 ? '' : `?days=${days}`
    api.get(`/admin/analytics${q}`)
      .then(r => setData(r.data.data))
      .catch(() => setData({}))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(AN_PRESETS[preset].days) }, [preset])

  const rev      = data?.revenue         || {}
  const students = data?.students        || {}
  const sessions = data?.sessions        || {}
  const modules  = data?.modules         || {}
  const lb       = data?.leaderboards    || {}

  const revenueByMonth    = rev.by_month         || []
  const revenueByPlan     = rev.by_plan           || []
  const signupsByMonth    = students.signups_by_month || []
  const sessionsByMonth   = sessions.by_month     || []
  const sessionsByModule  = sessions.by_module    || []
  const enrollByModule    = modules.by_enrollment || []
  const topStudents       = lb.top_students       || []
  const topTutors         = lb.top_tutors         || []
  const tutorRatings      = lb.tutor_ratings      || []

  const presetBar = (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg2)', borderRadius: 8, padding: 3 }}>
      {AN_PRESETS.map((p, i) => (
        <button key={p.label} onClick={() => setPreset(i)}
          style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
            background: preset === i ? 'var(--bg)' : 'transparent',
            color: preset === i ? 'var(--accent)' : 'var(--text3)',
            boxShadow: preset === i ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
          }}>{p.label}</button>
      ))}
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{presetBar}</div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 28, height: 28 }} /></div>
    </div>
  )

  return (
    <>
      {/* Preset selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>
          {data?.period ? `${new Date(data.period.from).toLocaleDateString()} – ${new Date(data.period.to).toLocaleDateString()}` : ''}
        </div>
        {presetBar}
      </div>

      {/* ── Row 1: Revenue stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
        <StatCard label="Gross revenue" value={rev.total_gross || 0}    money icon={TrendingUp} tint="indigo" sub={`${rev.payment_count || 0} payments`} />
        <StatCard label="Net revenue"   value={rev.net         || 0}    money icon={DollarSign} tint="teal"   sub="after refunds" />
        <StatCard label="Total refunded" value={rev.total_refunded || 0} money icon={RotateCcw}  tint="red"    sub={`${rev.refund_count || 0} refunds`} />
        <StatCard label="Refund rate"   value={`${rev.refund_rate || 0}%`} icon={AlertCircle} tint="amber"  sub="of payments" />
      </div>

      {/* ── Row 2: Student + session stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <StatCard label="New signups"       value={students.new_signups    || 0} icon={Users}     tint="violet" sub={`${students.total_alltime || 0} total`} />
        <StatCard label="Conversion rate"   value={`${students.period_conversion || 0}%`} icon={TrendingUp} tint="teal" sub="signup → payment" />
        <StatCard label="Sessions"          value={sessions.total || 0}          icon={Calendar}  tint="indigo" sub={`${sessions.completed || 0} completed`} />
        <StatCard label="Avg. rating"       value={Number(data?.avg_rating || 0).toFixed(1)} icon={Star} tint="amber" sub={`${tutorRatings.length} tutors rated`} />
      </div>

      {/* ── Revenue chart ── */}
      {revenueByMonth.length > 0 && (
        <div className="card" style={{ padding: 22, marginBottom: 18 }}>
          <SectionHeader icon={TrendingUp} title="Revenue" sub="Gross revenue with refunds overlaid in red" />
          <div style={{ display: 'flex', gap: 20, fontSize: 12.5, marginBottom: 14, color: 'var(--text3)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(180deg,var(--accent),#7c5cff)' }} /> Gross
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(239,68,68,0.55)' }} /> Refunded
            </span>
          </div>
          <BarChart
            data={revenueByMonth}
            height={180}
            getGross={m => m.gross}
            getRefunded={m => m.refunded}
            getLabel={m => m.m || m.month?.slice(5) || ''}
            getTooltip={m => `Gross: ${fmtMoney(m.gross)}  Refunded: ${fmtMoney(m.refunded)}  Net: ${fmtMoney(m.net)}`}
          />
          {/* Revenue by plan */}
          {revenueByPlan.length > 0 && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Net revenue by plan <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text3)' }}>(gross − refunds)</span></div>
              <HBarChart
                data={revenueByPlan}
                getName={p => p.plan_name}
                getValue={p => p.net ?? p.gross}
                getRight={p => fmtMoney(p.net ?? p.gross)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Student acquisition ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <div className="card" style={{ padding: 22 }}>
          <SectionHeader icon={Users} title="Student signups" sub="New registrations per month" />
          {signupsByMonth.length > 0
            ? <BarChart data={signupsByMonth} height={140} getGross={m => m.count} getLabel={m => m.m || m.month?.slice(5) || ''} getTooltip={m => `${m.count} signups`} />
            : <EmptyState text="No signups in this period." />}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>All-time total</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>{students.total_alltime || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Ever subscribed</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>{students.subscribed_alltime || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>All-time conv.</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>{students.alltime_conversion || 0}%</div>
            </div>
          </div>
        </div>

        {/* ── Sessions per month ── */}
        <div className="card" style={{ padding: 22 }}>
          <SectionHeader icon={Calendar} title="Sessions per month" />
          {sessionsByMonth.length > 0
            ? <BarChart data={sessionsByMonth} height={140} getGross={m => m.total} getLabel={m => m.m || m.month?.slice(5) || ''} getTooltip={m => `Total: ${m.total}  Completed: ${m.completed}  Cancelled: ${m.cancelled}`} />
            : <EmptyState text="No sessions in this period." />}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Completion</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--success)' }}>{sessions.completion_rate || 0}%</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Cancellation</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--danger)' }}>{sessions.cancellation_rate || 0}%</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Total</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>{sessions.total || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sessions by module ── */}
      {sessionsByModule.length > 0 && (
        <div className="card" style={{ padding: 22, marginBottom: 18 }}>
          <SectionHeader icon={Layers} title="Sessions by module" sub="Completion rate per module" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {sessionsByModule.map((x, i) => {
              const maxN = Math.max(...sessionsByModule.map(s => s.sessions), 1)
              return (
                <div key={x.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 160, fontSize: 13, fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name || 'Module'}</span>
                  <div style={{ flex: 1, height: 20, background: 'var(--bg2)', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ width: `${(x.sessions / maxN) * 100}%`, height: '100%', background: TINTS[tintOf(i)].fg, borderRadius: 5, opacity: 0.85 }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, width: 32, textAlign: 'right' }}>{x.sessions}</span>
                  <span style={{ fontSize: 12, color: x.completion_rate >= 80 ? 'var(--success)' : x.completion_rate >= 50 ? 'var(--warning)' : 'var(--danger)', width: 44, textAlign: 'right', fontWeight: 600 }}>{x.completion_rate}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Module enrollments ── */}
      {enrollByModule.length > 0 && (
        <div className="card" style={{ padding: 22, marginBottom: 18 }}>
          <SectionHeader icon={BookOpen} title="Module enrollments" sub="New enrollments in this period" />
          <HBarChart
            data={enrollByModule}
            getName={m => m.module_name}
            getValue={m => m.enrolled_count}
            getRight={m => m.enrolled_count}
            tints
          />
        </div>
      )}

      {/* ── Leaderboards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 8 }} className="lb-grid">
        <div className="card" style={{ padding: 22 }}>
          <SectionHeader icon={Star} title="Top students" />
          {topStudents.slice(0, 5).map((s, i) => (
            <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text3)', width: 16 }}>{i + 1}</span>
              <Avatar initials={initOf(s)} tint={tintOf(i)} size={30} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.first_name} {s.last_name}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>{fmtMoney((s.total_cents || 0) / 100)}</span>
            </div>
          ))}
          {topStudents.length === 0 && <EmptyState text="No data yet." />}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <SectionHeader icon={Shield} title="Top tutors" />
          {topTutors.slice(0, 5).map((x, i) => (
            <div key={x.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text3)', width: 16 }}>{i + 1}</span>
              <Avatar initials={initOf(x)} tint={tintOf(i)} size={30} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.first_name} {x.last_name}</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{x.sessions}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11 }}>{x.hours}h</div>
              </div>
            </div>
          ))}
          {topTutors.length === 0 && <EmptyState text="No data yet." />}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <SectionHeader icon={Star} title="Tutor ratings" />
          {tutorRatings.slice(0, 5).map((x, i) => (
            <div key={x.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text3)', width: 16 }}>{i + 1}</span>
              <Avatar initials={initOf(x)} tint={tintOf(i)} size={30} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.first_name} {x.last_name}</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{x.avg_rating}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11 }}>{x.review_count} reviews</div>
              </div>
            </div>
          ))}
          {tutorRatings.length === 0 && <EmptyState text="No ratings yet." />}
        </div>
      </div>
    </>
  )
}

// ── Manage Modules ───────────────────────────────────────────────
function AdminManageModules() {
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')
  const [saving, setSaving]   = useState(false)
  const [editMod, setEditMod] = useState(null)

  const load = () => {
    api.get('/admin/manage/modules')
      .then(r => setModules(r.data.data?.modules || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openNew  = () => setEditMod({ isNew: true, name: '', category: '', credit_cost: 1, cert_sessions_required: '', short_description: '', full_description: '', status: 'unpublished', visibility: 'hidden', display_order: 0 })
  const openEdit = m  => setEditMod({ isNew: false, ...m })

  const save = async () => {
    if (!editMod.name?.trim()) return
    setSaving(true)
    try {
      const body = {
        name:                    editMod.name.trim(),
        category:                editMod.category || '',
        credit_cost:             Number(editMod.credit_cost) || 1,
        cert_sessions_required:  editMod.cert_sessions_required !== '' && editMod.cert_sessions_required != null
                                   ? Number(editMod.cert_sessions_required)
                                   : null,
        short_description: editMod.short_description || '',
        full_description:  editMod.full_description  || '',
        status:            editMod.status,
        visibility:        editMod.visibility,
        display_order:     Number(editMod.display_order) || 0,
      }
      if (editMod.isNew) {
        await api.post('/admin/manage/modules', body)
      } else {
        await api.put(`/admin/manage/modules/${editMod.id}`, body)
      }
      setEditMod(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save module')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (m, e) => {
    e.stopPropagation()
    try {
      await api.patch(`/admin/manage/modules/${m.id}/status`)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
  }

  const STATUSES = ['all', 'published', 'unpublished', 'draft']
  const filtered  = filter === 'all' ? modules : modules.filter(m => m.status === filter)
  const statusChip = s => s === 'published' ? 'chip-good' : s === 'unpublished' ? 'chip-soft' : 'chip'
  const visChip    = v => v === 'public' ? 'chip-good' : 'chip'

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <SegTabs value={filter} onChange={setFilter} tabs={STATUSES.map(s => ({
          id: s,
          label: s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1),
          count: s === 'all' ? modules.length : modules.filter(m => m.status === s).length,
        }))} />
        <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={16} /> New module</button>
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Module', 'Category', 'Credits', 'Cert after', 'Status', 'Visibility', ''].map((h, i) => (
              <th key={i} style={{ padding: '12px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'left', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((m, i) => (
              <tr key={m.id} onClick={() => openEdit(m)} style={{ cursor: 'pointer', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '12px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ModTile mono={monoOf(m.name)} tint={tintOf(i)} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                      <div style={{ color: 'var(--text3)', fontSize: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.short_description || ''}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 18px', color: 'var(--text3)', fontSize: 13 }}>{m.category || '—'}</td>
                <td style={{ padding: '12px 18px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'var(--credit-bg)', color: 'var(--credit)', border: '1px solid var(--credit-line)' }}>
                    <Star size={11} fill="var(--credit)" strokeWidth={0} />{m.credit_cost}
                  </span>
                </td>
                <td style={{ padding: '12px 18px', color: 'var(--text3)', fontSize: 13 }}>
                  {m.cert_sessions_required ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: 'var(--accent)' }}>
                      <Award size={13} /> {m.cert_sessions_required} sessions
                    </span>
                  ) : '—'}
                </td>
                <td style={{ padding: '12px 18px' }}><span className={`chip ${statusChip(m.status)}`}>{m.status}</span></td>
                <td style={{ padding: '12px 18px' }}><span className={`chip ${visChip(m.visibility)}`}>{m.visibility}</span></td>
                <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                  <button
                    className={`btn btn-sm ${m.status === 'published' ? 'btn-outline' : 'btn-primary'}`}
                    style={{ minWidth: 100 }}
                    onClick={e => toggleStatus(m, e)}>
                    {m.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>No modules found. Click "New module" to add one.</div>}
      </div>

      <Modal open={!!editMod} onClose={() => setEditMod(null)} width={620}>
        {editMod && (
          <div>
            <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{editMod.isNew ? 'New module' : 'Edit module'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18 }}>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>Module name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input" value={editMod.name} onChange={e => setEditMod(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Resume & CV Building" />
              </div>
              <div className="field">
                <label>Category</label>
                <input className="input" value={editMod.category || ''} onChange={e => setEditMod(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Career Materials" />
              </div>
              <div className="field">
                <label>Credits per session</label>
                <input className="input" type="number" min={1} max={10} value={editMod.credit_cost ?? ''} onChange={e => setEditMod(p => ({ ...p, credit_cost: e.target.value }))} placeholder="e.g. 1" />
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>How many credits a student spends per 90-min session in this module.</div>
              </div>
              <div className="field">
                <label>Sessions required for certificate <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
                <input className="input" type="number" min={1} max={50}
                  value={editMod.cert_sessions_required ?? ''}
                  onChange={e => setEditMod(p => ({ ...p, cert_sessions_required: e.target.value }))}
                  placeholder="e.g. 3" />
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>After this many completed sessions a certification request is automatically created for admin approval. Leave blank to disable.</div>
              </div>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>Short description (shown on cards)</label>
                <textarea className="form-input" rows={2} value={editMod.short_description || ''} onChange={e => setEditMod(p => ({ ...p, short_description: e.target.value }))} placeholder="e.g. Master the tools and techniques to craft a resume that gets past ATS and lands in human hands." style={{ resize: 'vertical' }} />
              </div>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>Full description (shown on module detail page)</label>
                <textarea className="form-input" rows={5} value={editMod.full_description || ''} onChange={e => setEditMod(p => ({ ...p, full_description: e.target.value }))} placeholder={"What this module covers and what students walk away with.\n\n• ATS optimisation and keyword targeting\n• Format and layout best practices\n• Tailoring your resume for specific roles\n• Common mistakes and how to avoid them"} style={{ resize: 'vertical' }} />
              </div>
              <div className="field">
                <label>Status</label>
                <select className="select" value={editMod.status} onChange={e => setEditMod(p => ({ ...p, status: e.target.value }))}>
                  <option value="draft">Draft (not visible)</option>
                  <option value="unpublished">Unpublished</option>
                  <option value="published">Published (visible on landing)</option>
                </select>
              </div>
              <div className="field">
                <label>Visibility</label>
                <select className="select" value={editMod.visibility} onChange={e => setEditMod(p => ({ ...p, visibility: e.target.value }))}>
                  <option value="hidden">Hidden</option>
                  <option value="public">Public</option>
                </select>
              </div>
              <div className="field">
                <label>Display order</label>
                <input className="input" type="number" min={0} value={editMod.display_order ?? 0} onChange={e => setEditMod(p => ({ ...p, display_order: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditMod(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={!editMod.name?.trim() || saving} onClick={save}>
                {saving ? <><span className="spinner" /> Saving…</> : <><Check size={15} /> {editMod.isNew ? 'Create module' : 'Save changes'}</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

// ── Manage Plans ─────────────────────────────────────────────────
function AdminManagePlans() {
  const [plans, setPlans]         = useState([])
  const [availMods, setAvailMods] = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(null)
  const [editPlan, setEditPlan]   = useState(null)

  const load = async () => {
    try {
      const [pr, mr] = await Promise.all([
        api.get('/admin/manage/plans'),
        api.get('/admin/manage/modules'),
      ])
      setPlans(pr.data.data?.plans || [])
      setAvailMods(mr.data.data?.modules || [])
    } catch (e) {}
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openNew = () => setEditPlan({
    isNew: true, name: '', tagline: '', description: '', credits_per_module: 4, whats_included: [], price: '', status: 'draft',
    is_recommended: false, badge_label: '', display_order: 0, planModules: [],
  })

  const openEdit = p => setEditPlan({
    isNew: false, ...p,
    price: p.price_cents ? String(Math.round(p.price_cents / 100)) : '',
    description:        p.description || '',
    credits_per_module: p.credits_per_module ?? 4,
    whats_included:     Array.isArray(p.whats_included) ? p.whats_included : [],
    planModules: (p.plan_modules || []).map(pm => ({
      module_id:        pm.module_id,
      credits_included: pm.credits_included,
      name:             pm.module?.name || '',
    })),
  })

  const save = async () => {
    if (!editPlan.name?.trim()) return
    setSaving(true)
    try {
      const body = {
        name:               editPlan.name.trim(),
        tagline:            editPlan.tagline || '',
        description:        editPlan.description || '',
        credits_per_module: Number(editPlan.credits_per_module) || 4,
        whats_included:     (editPlan.whats_included || []).map(s => s.trim()).filter(Boolean),
        price_cents:    Math.round(Number(editPlan.price || 0) * 100),
        status:         editPlan.status,
        is_recommended: !!editPlan.is_recommended,
        badge_label:    editPlan.badge_label || null,
        display_order:  Number(editPlan.display_order) || 0,
        modules:        editPlan.planModules.map(pm => ({
          module_id:        pm.module_id,
          credits_included: Number(pm.credits_included) || 1,
        })),
      }
      if (editPlan.isNew) {
        await api.post('/admin/manage/plans', body)
      } else {
        await api.put(`/admin/manage/plans/${editPlan.id}`, body)
      }
      setEditPlan(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  const del = async p => {
    if (!(await confirmDialog(`Delete "${p.name}"? This cannot be undone.`))) return
    setDeleting(p.id)
    try {
      await api.delete(`/admin/manage/plans/${p.id}`)
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const setRecommended = async (p, e) => {
    e.stopPropagation()
    try {
      await api.patch(`/admin/manage/plans/${p.id}/recommend`)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
  }

  const addModuleToPlan = moduleId => {
    if (!moduleId) return
    const mod = availMods.find(m => m.id === moduleId)
    if (!mod || editPlan.planModules.some(pm => pm.module_id === moduleId)) return
    setEditPlan(p => ({ ...p, planModules: [...p.planModules, { module_id: moduleId, credits_included: 4, name: mod.name }] }))
  }

  const statusChip = s => s === 'active' ? 'chip-good' : s === 'draft' ? 'chip-soft' : 'chip'

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 24, height: 24 }} /></div>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={16} /> New plan</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {plans.map((p, i) => {
          const totalCredits = (p.plan_modules || []).reduce((s, pm) => s + (pm.credits_included || 0), 0)
          return (
            <div key={p.id} className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)' }}>{p.name}</span>
                    <span className={`chip ${statusChip(p.status)}`}>{p.status}</span>
                    {p.is_recommended && <span className="chip" style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700 }}>★ Recommended</span>}
                  </div>
                  {p.tagline && <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4, maxWidth: 560 }}>{p.tagline}</div>}
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', fontSize: 13 }}>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>${(p.price_cents / 100).toLocaleString('en-US')}</span>
                    <span style={{ color: 'var(--text3)' }}>{(p.plan_modules || []).length} module{(p.plan_modules || []).length !== 1 ? 's' : ''}</span>
                    {totalCredits > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: 'var(--credit-bg)', color: 'var(--credit)', border: '1px solid var(--credit-line)', fontWeight: 700, fontSize: 12 }}>
                        <Star size={10} fill="var(--credit)" strokeWidth={0} /> {totalCredits} credits total
                      </span>
                    )}
                  </div>
                  {(p.plan_modules || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {p.plan_modules.map(pm => (
                        <span key={pm.id} className="chip chip-line" style={{ fontSize: 11 }}>
                          {pm.module?.name} · <Star size={9} fill="var(--credit)" strokeWidth={0} style={{ color: 'var(--credit)', verticalAlign: 'middle' }} /> {pm.credits_included}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
                  {!p.is_recommended && (
                    <button className="btn btn-ghost btn-sm" onClick={e => setRecommended(p, e)}>Set recommended</button>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={() => openEdit(p)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '0 10px' }} disabled={deleting === p.id} onClick={() => del(p)}>
                    {deleting === p.id ? <span className="spinner" /> : <X size={15} />}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {plans.length === 0 && <EmptyState text="No plans yet. Click 'New plan' to create one." />}
      </div>

      <Modal open={!!editPlan} onClose={() => setEditPlan(null)} width={680}>
        {editPlan && (
          <div>
            <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{editPlan.isNew ? 'New plan' : 'Edit plan'}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18 }}>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>Plan name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input" value={editPlan.name} onChange={e => setEditPlan(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Interview Ready" />
              </div>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>Tagline <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(one line shown below plan name)</span></label>
                <input className="input" value={editPlan.tagline || ''} onChange={e => setEditPlan(p => ({ ...p, tagline: e.target.value }))} placeholder="e.g. Everything you need to land your next role — resume, interviews, and strategy covered." />
              </div>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>Description <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(paragraph shown above bullet points)</span></label>
                <textarea className="form-input" rows={3} value={editPlan.description || ''} onChange={e => setEditPlan(p => ({ ...p, description: e.target.value }))} placeholder="e.g. This plan gives you hands-on support across every stage of your job search — from crafting a standout resume to nailing the interview and negotiating your offer." style={{ resize: 'vertical' }} />
              </div>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>What's included <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(shown as tick marks on plan page)</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(editPlan.whats_included || []).map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Check size={13} strokeWidth={2.5} style={{ color: 'var(--success)', flexShrink: 0 }} />
                      <input
                        className="input"
                        style={{ flex: 1 }}
                        value={item}
                        onChange={e => setEditPlan(p => ({ ...p, whats_included: p.whats_included.map((x, j) => j === i ? e.target.value : x) }))}
                        placeholder="e.g. Polished, ATS-ready resume"
                      />
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '4px 8px', flexShrink: 0 }}
                        onClick={() => setEditPlan(p => ({ ...p, whats_included: p.whats_included.filter((_, j) => j !== i) }))}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', gap: 6, marginTop: 2 }}
                    onClick={() => setEditPlan(p => ({ ...p, whats_included: [...(p.whats_included || []), ''] }))}>
                    <Plus size={14} /> Add item
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Price (USD)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: 12, fontWeight: 700, color: 'var(--text2)' }}>$</span>
                  <input className="input" type="number" min={0} step={1} value={editPlan.price} onChange={e => setEditPlan(p => ({ ...p, price: e.target.value }))} style={{ paddingLeft: 26 }} placeholder="549" />
                </div>
              </div>
              <div className="field">
                <label>Status</label>
                <select className="select" value={editPlan.status} onChange={e => setEditPlan(p => ({ ...p, status: e.target.value }))}>
                  <option value="draft">Draft (hidden from landing)</option>
                  <option value="active">Active (visible on landing page)</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="field">
                <label>Badge label (optional)</label>
                <input className="input" value={editPlan.badge_label || ''} onChange={e => setEditPlan(p => ({ ...p, badge_label: e.target.value }))} placeholder="e.g. Most Popular" />
              </div>
              <div className="field">
                <label>Display order</label>
                <input className="input" type="number" min={0} value={editPlan.display_order ?? 0} onChange={e => setEditPlan(p => ({ ...p, display_order: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: editPlan.is_recommended ? 'var(--accent-light)' : 'var(--bg2)', borderRadius: 10, cursor: 'pointer' }}
                onClick={() => setEditPlan(p => ({ ...p, is_recommended: !p.is_recommended }))}>
                <input type="checkbox" checked={!!editPlan.is_recommended} onChange={() => {}} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <span style={{ fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Mark as recommended — shows "Most popular" badge on landing page</span>
              </div>
            </div>

            <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={16} style={{ color: 'var(--accent)' }} /> Included modules & credits
              </div>

              {editPlan.planModules.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {editPlan.planModules.map((pm, idx) => (
                    <div key={pm.module_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 10 }}>
                      <ModTile mono={monoOf(pm.name)} tint={tintOf(idx)} size={32} />
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{pm.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <Star size={13} fill="var(--credit)" strokeWidth={0} style={{ color: 'var(--credit)' }} />
                        <input
                          type="number" min={1} max={50} value={pm.credits_included}
                          onChange={e => setEditPlan(p => ({ ...p, planModules: p.planModules.map(x => x.module_id === pm.module_id ? { ...x, credits_included: Number(e.target.value) || 1 } : x) }))}
                          style={{ width: 56, height: 34, borderRadius: 8, border: '1px solid var(--border)', padding: '0 8px', fontWeight: 700, fontSize: 13, textAlign: 'center', background: '#fff', fontFamily: 'inherit' }}
                        />
                        <span style={{ color: 'var(--text3)', fontSize: 12, minWidth: 44 }}>credits</span>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '4px 8px' }}
                        onClick={() => setEditPlan(p => ({ ...p, planModules: p.planModules.filter(x => x.module_id !== pm.module_id) }))}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <select className="select"
                value=""
                onChange={e => { if (e.target.value) addModuleToPlan(e.target.value); e.target.value = '' }}>
                <option value="" disabled>+ Add a module to this plan…</option>
                {availMods.filter(m => !editPlan.planModules.some(pm => pm.module_id === m.id)).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              {availMods.filter(m => !editPlan.planModules.some(pm => pm.module_id === m.id)).length === 0 && editPlan.planModules.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 6 }}>All available modules included.</div>
              )}
              {editPlan.planModules.length === 0 && (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>No modules added — this is a single-module plan. The student picks their module at checkout.</div>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label>Credits to top up <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(added to whichever module the student picks)</span></label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        className="input" type="number" min={1} max={50}
                        style={{ width: 90 }}
                        value={editPlan.credits_per_module ?? 4}
                        onChange={e => setEditPlan(p => ({ ...p, credits_per_module: e.target.value }))}
                        placeholder="e.g. 4"
                      />
                      <span style={{ fontSize: 13, color: 'var(--text3)' }}>credits (1 credit = 1 × 90-min session)</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditPlan(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={!editPlan.name?.trim() || saving} onClick={save}>
                {saving ? <><span className="spinner" /> Saving…</> : <><Check size={15} /> {editPlan.isNew ? 'Create plan' : 'Save changes'}</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

// ── AdminHelpChats ──────────────────────────────────────────────
function AdminHelpChats() {
  const { user } = useAuth()
  const [tab,       setTab]       = useTabParam('queue')
  const [queue,     setQueue]     = useState([])
  const [history,   setHistory]   = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [sending,   setSending]   = useState(false)
  const [claiming,  setClaiming]  = useState(null)
  const [userTyping, setUserTyping] = useState(false)
  const typingTimer     = useRef(null)
  const emitTypingTimer = useRef(null)
  const socketRef       = useRef(null)
  const messagesEnd     = useRef(null)
  const pollRef         = useRef(null)

  const loadQueue   = useCallback(() => api.get('/help-chat/admin/queue').then(r => setQueue(r.data.data?.chats || [])).catch(() => {}), [])
  const loadHistory = useCallback(() => api.get('/help-chat/admin/history').then(r => setHistory(r.data.data?.chats || [])).catch(() => {}), [])

  useEffect(() => {
    loadQueue()
    loadHistory()
    // Poll queue every 8 seconds for new requests
    pollRef.current = setInterval(() => { loadQueue(); loadHistory() }, 8000)
    return () => clearInterval(pollRef.current)
  }, [loadQueue, loadHistory])

  // Socket listeners for real-time updates
  useEffect(() => {
    const s = getSocket()
    socketRef.current = s

    const onNewRequest = ({ chat }) => {
      setQueue(prev => prev.some(c => c.id === chat.id) ? prev : [chat, ...prev])
    }
    const onQueueUpdate = ({ chatId, action }) => {
      if (action === 'claimed') setQueue(prev => prev.filter(c => c.id !== chatId))
    }
    const onMessage = ({ chatId, message }) => {
      setMessages(prev => {
        if (!activeChat || activeChat.id !== chatId) return prev
        if (prev.some(m => m.id === message.id)) return prev
        return [...prev, message]
      })
    }
    const onTyping = ({ chatId, isTyping }) => {
      if (!activeChat || activeChat.id !== chatId) return
      setUserTyping(isTyping)
      clearTimeout(typingTimer.current)
      if (isTyping) typingTimer.current = setTimeout(() => setUserTyping(false), 3000)
    }
    const onClosed = ({ chatId }) => {
      setActiveChat(prev => prev?.id === chatId ? { ...prev, status: 'closed' } : prev)
      loadHistory()
    }

    s.on('helpChat:new_request',  onNewRequest)
    s.on('helpChat:queue_update', onQueueUpdate)
    s.on('helpChat:message',      onMessage)
    s.on('helpChat:typing',       onTyping)
    s.on('helpChat:closed',       onClosed)

    return () => {
      s.off('helpChat:new_request',  onNewRequest)
      s.off('helpChat:queue_update', onQueueUpdate)
      s.off('helpChat:message',      onMessage)
      s.off('helpChat:typing',       onTyping)
      s.off('helpChat:closed',       onClosed)
    }
  }, [activeChat?.id, loadHistory])

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, userTyping])

  const claimChat = async (chatId) => {
    setClaiming(chatId)
    try {
      const r = await api.post(`/help-chat/admin/${chatId}/claim`)
      const chat = r.data.data.chat
      setActiveChat(chat)
      setMessages(chat.messages || [])
      setTab('active')
      setQueue(prev => prev.filter(c => c.id !== chatId))
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not claim chat')
    } finally {
      setClaiming(null)
    }
  }

  const openHistory = async (chatId) => {
    const r = await api.get(`/help-chat/admin/${chatId}`)
    const chat = r.data.data.chat
    setActiveChat(chat)
    setMessages(chat.messages || [])
    setTab('active')
  }

  const sendMessage = async () => {
    if (!input.trim() || !activeChat || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)
    const optimistic = {
      id: 'opt_' + Date.now(),
      content,
      sent_at: new Date().toISOString(),
      sender: { id: user.id, role: 'admin', first_name: user.first_name, last_name: user.last_name },
    }
    setMessages(prev => [...prev, optimistic])
    try {
      const r = await api.post(`/help-chat/admin/${activeChat.id}/messages`, { content })
      setMessages(prev => prev.map(m => m.id === optimistic.id ? r.data.data.message : m))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  const closeChat = async () => {
    if (!activeChat || activeChat.status === 'closed') return
    if (!(await confirmDialog('Close this chat?'))) return
    try {
      await api.post(`/help-chat/admin/${activeChat.id}/close`)
      setActiveChat(prev => prev ? { ...prev, status: 'closed' } : prev)
      loadHistory()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to close chat')
    }
  }

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  function fmtTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  function fmtAgo(iso) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const statusChip = s => {
    if (s === 'waiting') return <span className="chip" style={{ background: '#fbf0db', color: '#d98a1f', fontSize: 11 }}>Waiting</span>
    if (s === 'active')  return <span className="chip chip-good" style={{ fontSize: 11 }}>Active</span>
    return <span className="chip" style={{ background: 'var(--bg3)', color: 'var(--text3)', fontSize: 11 }}>Closed</span>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: activeChat ? '1fr 380px' : '1fr', gap: 20, alignItems: 'start' }}>

      {/* ── Left panel ── */}
      <div>
        <SegTabs
          tabs={[
            { id: 'queue',   label: 'Queue',   count: queue.length },
            { id: 'history', label: 'History', count: history.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tab === 'queue' && (
            <>
              {queue.length === 0 && <EmptyState text="No chats waiting. Queue is clear." />}
              {queue.map(c => (
                <div key={c.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: TINTS.indigo.bg, color: TINTS.indigo.fg, display: 'grid', placeItems: 'center', flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    {(c.requester?.first_name?.[0] || '?').toUpperCase()}{(c.requester?.last_name?.[0] || '').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.requester?.first_name} {c.requester?.last_name}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                      <span style={{ textTransform: 'capitalize' }}>{c.requester?.role}</span>
                      {c.subject && <><span>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{c.subject}</span></>}
                      <span>·</span><Clock size={11} /><span>{fmtAgo(c.created_at)}</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={claiming === c.id}
                    onClick={() => claimChat(c.id)}
                  >
                    {claiming === c.id ? <><span className="spinner" /> Joining…</> : <><UserCheck size={14} /> Accept</>}
                  </button>
                </div>
              ))}
            </>
          )}

          {tab === 'history' && (
            <>
              {history.length === 0 && <EmptyState text="No chat history yet." />}
              {history.map(c => (
                <button key={c.id} className="card" onClick={() => openHistory(c.id)}
                  style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: TINTS.violet.bg, color: TINTS.violet.fg, display: 'grid', placeItems: 'center', flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    {(c.requester?.first_name?.[0] || '?').toUpperCase()}{(c.requester?.last_name?.[0] || '').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.requester?.first_name} {c.requester?.last_name}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                      <span style={{ textTransform: 'capitalize' }}>{c.requester?.role}</span>
                      {c.subject && <><span>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{c.subject}</span></>}
                      <span>·</span><span>{c._count?.messages || 0} msgs</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {statusChip(c.status)}
                    <span style={{ color: 'var(--text3)', fontSize: 11 }}>{fmtAgo(c.created_at)}</span>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Right panel: active chat ── */}
      {activeChat && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 90 }}>
          {/* Chat header */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg2)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {activeChat.requester?.first_name} {activeChat.requester?.last_name}
                <span style={{ fontWeight: 500, color: 'var(--text3)', fontSize: 12, marginLeft: 6, textTransform: 'capitalize' }}>({activeChat.requester?.role})</span>
              </div>
              {activeChat.subject && <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 1 }}>{activeChat.subject}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {statusChip(activeChat.status)}
              {activeChat.status === 'active' && (
                <button className="btn btn-sm" onClick={closeChat} style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }}>
                  <X size={14} /> Close
                </button>
              )}
              <button onClick={() => setActiveChat(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 4 }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ height: 380, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }} className="scroll">
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>No messages yet.</div>
            )}
            {messages.map(m => {
              const mine = m.sender?.role === 'admin'
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%',
                    background: mine ? 'var(--accent)' : 'var(--bg2)',
                    color: mine ? '#fff' : 'var(--text)',
                    borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '8px 12px', fontSize: 13.5, lineHeight: 1.45,
                  }}>
                    {!mine && <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3, opacity: .65 }}>{m.sender?.first_name}</div>}
                    {m.content}
                    <div style={{ fontSize: 10.5, opacity: .55, marginTop: 3, textAlign: 'right' }}>{fmtTime(m.sent_at)}</div>
                  </div>
                </div>
              )
            })}
            {userTyping && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: 'var(--bg2)', borderRadius: '16px 16px 16px 4px', padding: '8px 14px', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)', display: 'block' }} />)}
                </div>
              </div>
            )}
            {activeChat.status === 'closed' && (
              <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '6px 0' }}>This chat has ended.</div>
            )}
            <div ref={messagesEnd} />
          </div>

          {/* Input */}
          {activeChat.status === 'active' && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea rows={1} className="input" placeholder="Type a reply…" value={input}
                onChange={e => {
                  setInput(e.target.value)
                  if (activeChat?.requester_id && socketRef.current) {
                    socketRef.current.emit('helpChat:typing', { chatId: activeChat.id, recipientId: activeChat.requester_id, isTyping: true })
                    clearTimeout(emitTypingTimer.current)
                    emitTypingTimer.current = setTimeout(() => {
                      socketRef.current?.emit('helpChat:typing', { chatId: activeChat.id, recipientId: activeChat.requester_id, isTyping: false })
                    }, 2000)
                  }
                }}
                onKeyDown={handleKey}
                style={{ flex: 1, resize: 'none', fontSize: 14, padding: '8px 12px', minHeight: 38, maxHeight: 96 }} />
              <button onClick={sendMessage} disabled={!input.trim() || sending}
                style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: input.trim() ? 'var(--accent)' : 'var(--bg3)', color: input.trim() ? '#fff' : 'var(--text3)', border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── DB Schema Viewer ────────────────────────────────────────────
const SCHEMA_MODEL_NAMES = {
  users: 'User', refresh_tokens: 'RefreshToken',
  student_tutor_assignments: 'StudentTutorAssignment', onboarding_responses: 'OnboardingResponse',
  courses: 'Course', course_modules: 'CourseModule', module_questions: 'ModuleQuestion',
  session_questionnaires: 'SessionQuestionnaire', module_materials: 'ModuleMaterial',
  pricing_plans: 'PricingPlan', enrollments: 'Enrollment', student_progress: 'StudentProgress',
  assignments: 'Assignment', assignment_students: 'AssignmentStudent',
  assignment_submissions: 'AssignmentSubmission', assignment_files: 'AssignmentFile',
  submission_files: 'SubmissionFile', certifications: 'Certification', tutor_reviews: 'TutorReview',
  tutor_availability: 'TutorAvailability', schedule_change_requests: 'ScheduleChangeRequest',
  sessions: 'Session', attendance_logs: 'AttendanceLog',
  conversations: 'Conversation', conversation_participants: 'ConversationParticipant',
  messages: 'Message', message_attachments: 'MessageAttachment', notifications: 'Notification',
  payments: 'Payment', audit_logs: 'AuditLog', faqs: 'Faq', contact_submissions: 'ContactSubmission',
  job_queue_logs: 'JobQueueLog', tutor_busy_slots: 'TutorBusySlot', course_meeting_links: 'CourseMeetingLink',
  tutor_profiles: 'TutorProfile', onboarding_requests: 'OnboardingRequest',
  module_tutors: 'ModuleTutor', module_enrollments: 'ModuleEnrollment', module_credits: 'ModuleCredit',
  course_tutors: 'CourseTutor', tutor_fees: 'TutorFee', support_tickets: 'SupportTicket',
  support_messages: 'SupportMessage', modules: 'Module', plans: 'Plan', plan_modules: 'PlanModule',
  help_chats: 'HelpChat', help_chat_messages: 'HelpChatMessage',
  tutor_banking_details: 'TutorBankingDetails', tutor_payouts: 'TutorPayout',
}
const SCHEMA_CATEGORIES = {
  Core:       ['users', 'refresh_tokens', 'student_tutor_assignments', 'onboarding_responses'],
  Learning:   ['courses', 'course_modules', 'module_questions', 'session_questionnaires', 'module_materials', 'pricing_plans', 'enrollments', 'student_progress', 'assignments', 'assignment_students', 'assignment_submissions', 'assignment_files', 'submission_files', 'certifications', 'tutor_reviews'],
  Scheduling: ['tutor_availability', 'schedule_change_requests', 'sessions', 'attendance_logs'],
  Comms:      ['conversations', 'conversation_participants', 'messages', 'message_attachments', 'notifications'],
  Payments:   ['payments'],
  Modules:    ['modules', 'plans', 'plan_modules', 'module_tutors', 'module_enrollments', 'module_credits', 'course_tutors'],
  Tutors:     ['tutor_profiles', 'tutor_fees', 'tutor_banking_details', 'tutor_payouts', 'tutor_busy_slots'],
  Support:    ['support_tickets', 'support_messages', 'help_chats', 'help_chat_messages'],
  Admin:      ['audit_logs', 'faqs', 'contact_submissions', 'job_queue_logs', 'course_meeting_links', 'onboarding_requests'],
}
const SCHEMA_CAT_COLORS = {
  Core:       { bg: '#e7effe', fg: '#2563eb' },
  Learning:   { bg: '#e1f5f1', fg: '#0f9b8e' },
  Scheduling: { bg: '#fbf0db', fg: '#d98a1f' },
  Comms:      { bg: '#ecebfd', fg: 'var(--accent)' },
  Payments:   { bg: '#fdecea', fg: '#dc2626' },
  Modules:    { bg: '#efeaff', fg: '#7c5cff' },
  Tutors:     { bg: '#fdf0e0', fg: '#c2610f' },
  Support:    { bg: '#fce8ff', fg: '#a21caf' },
  Admin:      { bg: '#e2ffe4', fg: '#16a34a' },
}

function schemaTypeColor(rawType) {
  if (rawType === 'uuid')                                    return { bg: '#f3e8ff', fg: '#7c3aed' }
  if (rawType === 'USER-DEFINED')                            return { bg: '#fce8ff', fg: '#a21caf' }
  if (rawType === 'boolean')                                 return { bg: '#fbf0db', fg: '#d98a1f' }
  if (['integer', 'bigint', 'smallint'].includes(rawType))   return { bg: '#e1f5f1', fg: '#0f9b8e' }
  if (['json', 'jsonb'].includes(rawType))                   return { bg: '#fef3c7', fg: '#b45309' }
  if (['numeric', 'decimal'].includes(rawType))              return { bg: '#e1f5f1', fg: '#0f9b8e' }
  if (['date', 'timestamp without time zone', 'timestamp with time zone'].includes(rawType)) return { bg: '#f1f5f9', fg: '#475569' }
  return { bg: '#e7effe', fg: '#2563eb' }
}

function schemaSimplifyType(col) {
  const { type, rawType } = col
  if (rawType === 'USER-DEFINED') return col.udtName
  const m = type.match(/^(.+?)\((\d+)\)$/)
  const base = m ? m[1] : rawType
  const size = m ? `(${m[2]})` : ''
  const MAP = {
    'character varying': 'varchar', 'timestamp without time zone': 'timestamp',
    'timestamp with time zone': 'timestamptz', 'boolean': 'bool', 'integer': 'int',
    'double precision': 'float8', 'numeric': 'decimal', 'date': 'date',
    'text': 'text', 'uuid': 'uuid', 'jsonb': 'jsonb', 'json': 'json', 'bigint': 'bigint',
  }
  return (MAP[base] || base) + size
}

function AdminSchemaViewer() {
  const [schema, setSchema]               = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [search, setSearch]               = useState('')
  const [collapsedTables, setCollapsedTables] = useState(new Set())
  const [collapsedCats, setCollapsedCats] = useState(new Set(['__empty']))
  const [filterCat, setFilterCat]         = useState('All')
  const [highlight, setHighlight]         = useState(null)
  const tableRefs = useRef({})

  const load = useCallback(() => {
    setLoading(true); setError(null)
    api.get('/admin/schema')
      .then(r => setSchema(r.data.data))
      .catch(e => setError(e.response?.data?.error || 'Failed to load schema'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const tableByName = useMemo(() => {
    if (!schema) return {}
    return Object.fromEntries(schema.tables.map(t => [t.name, t]))
  }, [schema])

  const filteredNames = useMemo(() => {
    if (!schema) return new Set()
    const q = search.toLowerCase()
    return new Set(schema.tables
      .filter(t => !q
        || t.name.toLowerCase().includes(q)
        || (SCHEMA_MODEL_NAMES[t.name] || '').toLowerCase().includes(q)
        || t.columns.some(c => c.name.toLowerCase().includes(q))
      )
      .map(t => t.name)
    )
  }, [schema, search])

  const toggleTable = name => setCollapsedTables(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })
  const toggleCat   = name => setCollapsedCats(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })

  const scrollToTable = name => {
    setCollapsedTables(s => { const n = new Set(s); n.delete(name); return n })
    const cat = Object.entries(SCHEMA_CATEGORIES).find(([, ts]) => ts.includes(name))?.[0]
    if (cat) setCollapsedCats(s => { const n = new Set(s); n.delete(cat); return n })
    setFilterCat('All')
    setHighlight(name)
    setTimeout(() => {
      tableRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => setHighlight(null), 2000)
    }, 80)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" role="status" aria-label="Loading" style={{ width: 32, height: 32 }} /></div>
  if (error)   return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <AlertCircle size={24} style={{ color: 'var(--danger)', marginBottom: 8 }} />
      <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>
      <button onClick={load} style={{ padding: '8px 20px', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Retry</button>
    </div>
  )

  const categorized = new Set(Object.values(SCHEMA_CATEGORIES).flat())
  const cats = filterCat === 'All' ? Object.keys(SCHEMA_CATEGORIES) : [filterCat]

  const renderCol = (col, tableName) => {
    const tc = schemaTypeColor(col.rawType)
    const dt = schemaSimplifyType(col)
    return (
      <div key={col.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 16px', borderBottom: '1px solid var(--border)', background: col.isPK ? 'rgba(251,240,219,.25)' : 'transparent', flexWrap: 'wrap' }}>
        <span style={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {col.isPK && <Key size={11} style={{ color: '#d98a1f' }} />}
          {col.isFk && !col.isPK && <Link2 size={11} style={{ color: '#2563eb' }} />}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: col.isPK ? 700 : 500, fontFamily: 'Consolas, monospace', color: 'var(--text)', minWidth: 120 }}>{col.name}</span>
        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: tc.bg, color: tc.fg, fontWeight: 600, fontFamily: 'monospace', flexShrink: 0 }}>{dt}</span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
          {col.isPK    && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fbf0db', color: '#b45309', fontWeight: 700 }}>PK</span>}
          {col.isUnique && !col.isPK && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#efeaff', color: '#7c5cff', fontWeight: 700 }}>UNIQUE</span>}
          {!col.nullable && !col.isPK && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fdecea', color: '#dc2626', fontWeight: 700 }}>NOT NULL</span>}
          {col.nullable  && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg2)', color: 'var(--text3)', fontWeight: 600 }}>NULL</span>}
        </div>
        {col.isFk && col.fkRef && (
          <button onClick={() => scrollToTable(col.fkRef.to_table)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: '#e7effe', color: '#2563eb', fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit' }}>
            <ArrowRight size={10} /> {col.fkRef.to_table}.{col.fkRef.to_column}
            {col.fkRef.delete_rule && col.fkRef.delete_rule !== 'NO ACTION' && <span style={{ marginLeft: 4, opacity: 0.65 }}>({col.fkRef.delete_rule.toLowerCase()})</span>}
          </button>
        )}
        {col.default && !col.default.startsWith('nextval') && (
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={col.default}>= {col.default.replace(/^'(.+)'.*$/, '$1').replace(/::.*$/, '')}</span>
        )}
      </div>
    )
  }

  const renderTable = (table) => {
    if (!filteredNames.has(table.name)) return null
    const modelName   = SCHEMA_MODEL_NAMES[table.name] || table.name
    const isCollapsed = collapsedTables.has(table.name)
    const isHighlight = highlight === table.name
    const pkCols = table.columns.filter(c => c.isPK).length
    const fkCols = table.columns.filter(c => c.isFk).length
    return (
      <div key={table.name} ref={el => tableRefs.current[table.name] = el} className="card"
        style={{ marginBottom: 10, overflow: 'hidden', outline: isHighlight ? '2px solid var(--accent)' : '2px solid transparent', outlineOffset: 1, transition: 'outline-color .3s ease' }}>
        <div onClick={() => toggleTable(table.name)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none', borderBottom: isCollapsed ? 'none' : '1px solid var(--border)', background: isCollapsed ? 'transparent' : 'var(--bg2)' }}>
          <Table2 size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: 'Consolas, monospace', fontWeight: 700, fontSize: 13.5 }}>{table.name}</span>
            <span style={{ marginLeft: 9, fontSize: 12, color: 'var(--text3)', fontWeight: 400 }}>{modelName}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{table.columns.length} cols</span>
            {pkCols > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fbf0db', color: '#b45309', fontWeight: 700 }}>PK×{pkCols}</span>}
            {fkCols > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#e7effe', color: '#2563eb', fontWeight: 700 }}>FK×{fkCols}</span>}
            <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)', padding: '2px 9px', borderRadius: 999, fontWeight: 600, border: '1px solid var(--border)' }}>{table.rowCount.toLocaleString()} rows</span>
            {isCollapsed ? <ChevronDown size={15} style={{ color: 'var(--text3)' }} /> : <ChevronDown size={15} style={{ color: 'var(--text3)', transform: 'rotate(180deg)' }} />}
          </div>
        </div>
        {!isCollapsed && <div>{table.columns.map(c => renderCol(c, table.name))}</div>}
      </div>
    )
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Tables',       value: schema.totalTables, icon: Database },
          { label: 'Columns',      value: schema.totalCols,   icon: Table2 },
          { label: 'Foreign Keys', value: schema.totalFKs,    icon: Link2 },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><s.icon size={19} /></div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginTop: 3 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tables or columns…"
            style={{ width: '100%', paddingLeft: 34, height: 38, borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
        <button onClick={load} style={{ height: 38, padding: '0 14px', borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text2)', fontFamily: 'inherit' }}>
          <RefreshCw size={13} /> Refresh
        </button>
        <button onClick={() => setCollapsedTables(new Set(schema.tables.map(t => t.name)))} style={{ height: 38, padding: '0 14px', borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text2)', fontFamily: 'inherit' }}>Collapse all</button>
        <button onClick={() => setCollapsedTables(new Set())} style={{ height: 38, padding: '0 14px', borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text2)', fontFamily: 'inherit' }}>Expand all</button>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['All', ...Object.keys(SCHEMA_CATEGORIES)].map(cat => {
          const on = filterCat === cat
          const cc = SCHEMA_CAT_COLORS[cat]
          return (
            <button key={cat} onClick={() => setFilterCat(cat)} style={{ height: 30, padding: '0 13px', borderRadius: 999, fontSize: 12.5, fontWeight: on ? 700 : 600, border: 'none', cursor: 'pointer', background: on ? (cc?.bg || 'var(--accent)') : 'var(--bg2)', color: on ? (cc?.fg || '#fff') : 'var(--text2)', fontFamily: 'inherit' }}>
              {cat}{cat !== 'All' && <span style={{ marginLeft: 5, opacity: 0.7 }}>{SCHEMA_CATEGORIES[cat].filter(n => filteredNames.has(n) && tableByName[n]?.rowCount > 0).length}</span>}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 2 }}>Legend</span>
        {[['PK', '#fbf0db', '#b45309'], ['FK', '#e7effe', '#2563eb'], ['UNIQUE', '#efeaff', '#7c5cff'], ['NOT NULL', '#fdecea', '#dc2626'], ['NULL', 'var(--bg2)', 'var(--text3)']].map(([lbl, bg, fg]) => (
          <span key={lbl} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: bg, color: fg, fontWeight: 700 }}>{lbl}</span>
        ))}
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f3e8ff', color: '#7c3aed', fontWeight: 600, fontFamily: 'monospace' }}>uuid</span>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#fce8ff', color: '#a21caf', fontWeight: 600, fontFamily: 'monospace' }}>enum</span>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#b45309', fontWeight: 600, fontFamily: 'monospace' }}>json</span>
      </div>

      {/* Tables by category — only tables with at least 1 row */}
      {cats.map(catName => {
        const catTables = (SCHEMA_CATEGORIES[catName] || []).map(n => tableByName[n]).filter(Boolean).filter(t => filteredNames.has(t.name) && t.rowCount > 0)
        if (catTables.length === 0) return null
        const cc = SCHEMA_CAT_COLORS[catName] || { bg: '#f1f5f9', fg: '#475569' }
        const isCatCollapsed = collapsedCats.has(catName)
        return (
          <div key={catName} style={{ marginBottom: 26 }}>
            <div onClick={() => toggleCat(catName)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ padding: '3px 12px', borderRadius: 999, background: cc.bg, color: cc.fg, fontWeight: 700, fontSize: 12.5, letterSpacing: '.02em', flexShrink: 0 }}>{catName}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, flexShrink: 0 }}>{catTables.length} table{catTables.length !== 1 ? 's' : ''}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <ChevronDown size={14} style={{ color: 'var(--text3)', flexShrink: 0, transform: isCatCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform .2s' }} />
            </div>
            {!isCatCollapsed && catTables.map(t => renderTable(t))}
          </div>
        )
      })}

      {/* Uncategorized with data */}
      {filterCat === 'All' && (() => {
        const extra = schema.tables.filter(t => !categorized.has(t.name) && filteredNames.has(t.name) && t.rowCount > 0)
        if (!extra.length) return null
        return (
          <div key="__other" style={{ marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ padding: '3px 12px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: 12.5 }}>Other</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            {extra.map(t => renderTable(t))}
          </div>
        )
      })()}

      {/* Empty / no data yet — all 0-row tables regardless of category, collapsed by default */}
      {(() => {
        const emptyTables = schema.tables.filter(t => t.rowCount === 0 && filteredNames.has(t.name))
        if (!emptyTables.length) return null
        const isCollapsed = collapsedCats.has('__empty')
        return (
          <div style={{ marginBottom: 26 }}>
            <div onClick={() => toggleCat('__empty')} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ padding: '3px 12px', borderRadius: 999, background: '#fef9ec', color: '#92400e', fontWeight: 700, fontSize: 12.5, letterSpacing: '.02em', flexShrink: 0, border: '1px dashed #fcd34d' }}>
                Unused Tables
              </span>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, flexShrink: 0 }}>{emptyTables.length} table{emptyTables.length !== 1 ? 's' : ''} — 0 rows, not in use</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)', borderStyle: 'dashed' }} />
              <ChevronDown size={14} style={{ color: 'var(--text3)', flexShrink: 0, transform: isCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform .2s' }} />
            </div>
            {!isCollapsed && (
              <div style={{ opacity: 0.7 }}>
                {emptyTables.map(t => renderTable(t))}
              </div>
            )}
          </div>
        )
      })()}

      {filteredNames.size === 0 && <EmptyState text={`No tables match "${search}"`} />}
    </div>
  )
}

// ── Main Admin Dashboard ────────────────────────────────────────
export default function AdminDashboard() {
  usePageTitle('Admin')
  const location = useLocation()
  const [supportCount, setSupportCount] = useState(0)
  useEffect(() => { api.get('/admin/support-tickets?status=open').then(r => setSupportCount(r.data.data?.total || 0)).catch(() => {}) }, [])

  const TITLES = {
    '/admin':                 ['Overview',          'Platform health at a glance.'],
    '/admin/modules':          ['Courses',           'Module overview and tutor assignments.'],
    '/admin/manage-modules':   ['Manage Modules',    'Create, edit, and publish course modules.'],
    '/admin/manage-plans':     ['Manage Plans',      'Configure pricing plans and module bundles.'],
    '/admin/students':         ['Students',          'Enrollment, credits, and payment history.'],
    '/admin/tutors':          ['Tutors',            'Session history and assignments.'],
    '/admin/sessions':        ['Sessions',          'All sessions — cancel, track requests, and view history.'],
    '/admin/payments':        ['Student Payments',  'Transactions and refunds.'],
    '/admin/payroll':         ['Tutor Payroll',     'Weekly session payouts.'],
    '/admin/logbook':         ['Admin Logbook',     'Every credit change, refund, and payroll action.'],
    '/admin/support':         ['Support',           'Incoming tickets from students.'],
    '/admin/help-chat':       ['Help Chat',         'Live support chats from students and tutors.'],
    '/admin/faqs':            ['FAQs',              'Manage the questions shown on the public site.'],
    '/admin/notify':          ['Notifications',     'Broadcast announcements to users.'],
    '/admin/email-templates': ['Email Templates',   'Edit the content of automated welcome emails.'],
    '/admin/analytics':       ['Analytics',         'Revenue, leaderboards, and session stats.'],
    '/admin/schema':          ['DB Schema',         'Live database structure — tables, columns, and relationships.'],
    '/admin/data-explorer':  ['Data Explorer',     'Browse, filter, sort, and export live data from any table.'],
  }

  const p = location.pathname
  const [title = 'Overview', subtitle = ''] = Object.entries(TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([k]) => p === k || p.startsWith(k + '/'))
    ?.[1] || []

  return (
    <AdminShell title={title} subtitle={subtitle} supportCount={supportCount}>
      <Routes>
        <Route index                  element={<Overview />} />
        <Route path="students/*"      element={<AdminStudents />} />
        <Route path="tutors/*"        element={<AdminTutors />} />
        <Route path="modules/*"        element={<AdminCourses />} />
        <Route path="manage-modules/*" element={<AdminManageModules />} />
        <Route path="manage-plans/*"   element={<AdminManagePlans />} />
        <Route path="payments/*"      element={<AdminPayments />} />
        <Route path="payroll/*"       element={<AdminPayroll />} />
        <Route path="sessions/*"        element={<AdminSessions />} />
        <Route path="certifications/*" element={<AdminCertifications />} />
        <Route path="logbook/*"        element={<AdminLogbook />} />
        <Route path="support/*"       element={<AdminSupport />} />
        <Route path="help-chat/*"     element={<AdminHelpChats />} />
        <Route path="faqs/*"          element={<AdminFaqs />} />
        <Route path="notify/*"        element={<AdminBroadcast />} />
        <Route path="email-templates/*" element={<AdminEmailTemplates />} />
        <Route path="analytics/*"     element={<AdminAnalytics />} />
        <Route path="schema/*"        element={<AdminSchemaViewer />} />
        <Route path="data-explorer/*" element={<AdminDataExplorer />} />
        <Route path="*"               element={<Overview />} />
      </Routes>
    </AdminShell>
  )
}
