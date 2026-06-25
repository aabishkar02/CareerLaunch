import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Filter, X, ChevronDown, ChevronUp, ChevronsUpDown,
  Download, Columns, Plus, ChevronLeft, ChevronRight,
  RefreshCw, AlertCircle, Search, Table2,
} from 'lucide-react'
import api from '../../services/api'

// ── helpers ────────────────────────────────────────────────────
const fmtCents  = c => c == null ? '' : '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })
const fmtDt     = iso => {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(iso))
  } catch { return String(iso) }
}
const uuidShort = s => typeof s === 'string' && s.length >= 8 ? s.slice(0,8) + '…' : s
const isUuid    = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s)
const isIso     = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s)
const isDateStr = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

const STATUS_COLORS = {
  active:'#16a34a', completed:'#2563eb', cancelled:'#dc2626', pending:'#d97706',
  confirmed:'#16a34a', succeeded:'#16a34a', failed:'#dc2626', refunded:'#7c5cff',
  open:'#d97706', in_review:'#2563eb', resolved:'#16a34a', closed:'var(--text3)',
  approved:'#16a34a', rejected:'#dc2626', revoked:'var(--text3)',
  student:'#2563eb', tutor:'#7c5cff', admin:'#d97706',
  high:'#dc2626', urgent:'#dc2626', normal:'#d97706', low:'#16a34a',
  published:'#16a34a', unpublished:'var(--text3)', draft:'#d97706',
  waiting:'#d97706', refunded_status:'#7c5cff',
}

function renderRelation(obj) {
  if (!obj || typeof obj !== 'object') return null
  // name-like fields first, then title, then email
  const name = [obj.first_name, obj.last_name].filter(Boolean).join(' ')
  if (name) return name
  if (obj.title) return obj.title
  if (obj.name)  return obj.name
  if (obj.email) return obj.email
  // fallback: first string value
  const first = Object.values(obj).find(v => typeof v === 'string')
  return first || JSON.stringify(obj)
}

function cellValue(val, key) {
  if (val === null || val === undefined) return <span style={{ color:'var(--text3)', fontSize:12 }}>—</span>
  if (typeof val === 'boolean') {
    return <span style={{ padding:'2px 8px', borderRadius:999, fontSize:12, fontWeight:600, background: val ? '#dcfce7' : '#fdecea', color: val ? '#16a34a' : '#dc2626' }}>{val ? 'Yes' : 'No'}</span>
  }
  if (typeof val === 'object' && !Array.isArray(val)) {
    const label = renderRelation(val)
    return <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }} title={JSON.stringify(val)}>{label}</span>
  }
  if (Array.isArray(val)) {
    const s = JSON.stringify(val)
    return <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--text3)' }} title={s}>{s.length > 60 ? s.slice(0,60) + '…' : s}</span>
  }
  if (isUuid(String(val))) {
    return <span style={{ fontFamily:'monospace', fontSize:12, color:'var(--text3)' }} title={String(val)}>{uuidShort(String(val))}</span>
  }
  if (isIso(String(val)) || isDateStr(String(val))) {
    return <span style={{ fontSize:12 }}>{isDateStr(String(val)) ? String(val) : fmtDt(val)}</span>
  }
  const s = String(val)
  const color = STATUS_COLORS[s.toLowerCase()] || STATUS_COLORS[s]
  if (color && s.length < 30 && !s.includes(' ') && !s.startsWith('http')) {
    return <span style={{ padding:'2px 9px', borderRadius:999, fontSize:12, fontWeight:600, background: color + '18', color }}>{s}</span>
  }
  if (s.length > 200) {
    return <span title={s} style={{ cursor:'default' }}>{s.slice(0,200) + '…'}</span>
  }
  return <span>{s}</span>
}

const OPERATOR_OPTIONS = {
  string: ['equals','contains','not'],
  number: ['equals','gt','lt','gte','lte','not'],
  date:   ['equals','gt','lt','gte','lte'],
  enum:   ['equals','in','not'],
  boolean:['equals'],
}

function guessType(field) {
  if (/(_at|_date|date_|scheduled_|clock_|issued_|paid_at|visible_at|completed_at|enrolled_at|started_at|reviewed_at)/.test(field)) return 'date'
  if (/(amount_cents|duration|order_index|score|credits|experience_years|pay_rate|price_cents|review_count|page|size)/.test(field)) return 'number'
  if (/(status|role|type|priority|category|method|day_of_week|change_type|billing_type|location|visibility)/.test(field)) return 'enum'
  if (/(suspended|published|featured|recurring|paid|read|email_sent|onboarded|approved|is_recommended|verified)/.test(field)) return 'boolean'
  return 'string'
}

// ── Analytics cards ────────────────────────────────────────────
function AnalyticsBar({ analytics }) {
  if (!analytics) return null
  const fmtMoney = c => '$' + ((c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })

  const cards = [
    { label:'Users',           stat: `${analytics.User?.total ?? 0} total`,                         sub: `${analytics.User?.new_last_30d ?? 0} new (30d) · ${analytics.User?.suspended ?? 0} suspended` },
    { label:'Revenue',         stat: fmtMoney(analytics.Payment?.total_revenue_cents),               sub: `${fmtMoney(analytics.Payment?.revenue_last_30d_cents)} last 30d` },
    { label:'Enrollments',     stat: `${analytics.Enrollment?.total ?? 0} total`,                    sub: `${analytics.Enrollment?.by_status?.active ?? 0} active` },
    { label:'Support Tickets', stat: `${analytics.SupportTicket?.open ?? 0} open`,                   sub: `${analytics.SupportTicket?.total ?? 0} total` },
    { label:'Tutor Fees',      stat: fmtMoney(analytics.TutorFee?.paid_sum_cents),                   sub: `${fmtMoney(analytics.TutorFee?.unpaid_sum_cents)} unpaid` },
    { label:'Payouts',         stat: fmtMoney(analytics.TutorPayout?.total_paid_cents),              sub: `${analytics.TutorPayout?.total ?? 0} payments` },
    { label:'Onboarding',      stat: `${analytics.OnboardingRequest?.total ?? 0} total`,             sub: `${analytics.OnboardingRequest?.by_status?.pending ?? 0} pending` },
    { label:'Certifications',  stat: `${analytics.Certification?.total ?? 0} total`,                 sub: `${analytics.Certification?.by_status?.pending ?? 0} pending` },
    { label:'Courses',         stat: `${analytics.Course?.total ?? 0} total`,                        sub: '' },
    { label:'Modules',         stat: `${analytics.Module?.total ?? 0} total`,                        sub: '' },
    { label:'Plans',           stat: `${analytics.Plan?.total ?? 0} total`,                          sub: '' },
    { label:'Audit Logs',      stat: `${analytics.AuditLog?.total ?? 0} total`,                      sub: '' },
    { label:'Reviews',         stat: `${analytics.TutorReview?.total ?? 0} total`,                   sub: '' },
    { label:'Banking Details', stat: `${analytics.TutorBankingDetails?.total ?? 0} profiles`,        sub: '' },
  ]

  return (
    <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:8 }} className="scroll">
      {cards.map(c => (
        <div key={c.table} className="card" style={{ padding:'14px 18px', minWidth:180, flexShrink:0 }}>
          <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text3)', marginBottom:6 }}>{c.label}</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:22, letterSpacing:'-0.03em', lineHeight:1 }}>{c.stat}</div>
          {c.sub && <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Drawer ─────────────────────────────────────────────────────
function RecordDrawer({ record, onClose }) {
  useEffect(() => {
    if (!record) return
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [record, onClose])

  if (!record) return null

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(24,23,31,.3)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:480, zIndex:201, background:'#fff', boxShadow:'-4px 0 32px rgba(0,0,0,.12)', overflowY:'auto', display:'flex', flexDirection:'column' }} className="scroll">
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:'#fff', zIndex:1 }}>
          <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:16 }}>Record detail</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', padding:6, display:'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding:'20px 24px', flex:1 }}>
          {Object.entries(record).map(([k, v]) => {
            const rel = typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)
            return (
              <div key={k} style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text3)', marginBottom:3 }}>{k}</div>
                {rel ? (
                  <div style={{ fontSize:13, background:'var(--bg2)', borderRadius:8, padding:'8px 12px' }}>
                    {Object.entries(v).map(([fk, fv]) => (
                      <div key={fk} style={{ display:'flex', gap:8, marginBottom:2 }}>
                        <span style={{ color:'var(--text3)', minWidth:80, fontSize:12 }}>{fk}:</span>
                        <span style={{ fontWeight:600 }}>{String(fv ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize:13, wordBreak:'break-all', fontFamily: isUuid(String(v ?? '')) ? 'monospace' : 'inherit' }}>
                    {v === null || v === undefined ? <span style={{ color:'var(--text3)' }}>—</span>
                      : isIso(String(v)) ? fmtDt(v)
                      : typeof v === 'boolean' ? (
                        <span style={{ padding:'2px 8px', borderRadius:999, fontSize:12, fontWeight:600, background: v ? '#dcfce7' : '#fdecea', color: v ? '#16a34a' : '#dc2626' }}>{v ? 'Yes' : 'No'}</span>
                      )
                      : typeof v === 'object' ? <pre style={{ margin:0, fontSize:12, background:'var(--bg2)', padding:8, borderRadius:6, overflow:'auto' }}>{JSON.stringify(v, null, 2)}</pre>
                      : String(v)
                    }
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Column picker ──────────────────────────────────────────────
function ColumnPicker({ columns, visible, onChange, onClose }) {
  const ref = useRef()
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [onClose])

  return (
    <div ref={ref} style={{ position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:100, background:'#fff', border:'1px solid var(--border)', borderRadius:12, boxShadow:'var(--shadow-lg)', padding:16, minWidth:220 }}>
      <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>Visible columns</div>
      <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:280, overflowY:'auto' }} className="scroll">
        {columns.map(col => (
          <label key={col} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
            <input type="checkbox" checked={visible.includes(col)} onChange={e => {
              if (e.target.checked) onChange([...visible, col])
              else onChange(visible.filter(c => c !== col))
            }} />
            <span style={{ fontFamily:'monospace', fontSize:12 }}>{col}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Filter builder ─────────────────────────────────────────────
function FilterBuilder({ columns, filters, onChange }) {
  const addFilter = () => onChange([...filters, { field: columns[0] || '', operator:'equals', value:'' }])
  const removeFilter = i => onChange(filters.filter((_, idx) => idx !== i))
  const updateFilter = (i, patch) => onChange(filters.map((f, idx) => idx === i ? { ...f, ...patch } : f))

  return (
    <div className="card" style={{ padding:16, marginBottom:12, background:'var(--bg2)', border:'1.5px solid var(--accent)' }}>
      <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'var(--accent)' }}>Filter Builder</div>
      {filters.length === 0 && <div style={{ color:'var(--text3)', fontSize:13, marginBottom:10 }}>No filters yet. Click "Add row" to start.</div>}
      {filters.map((f, i) => {
        const type = guessType(f.field)
        const ops  = OPERATOR_OPTIONS[type] || OPERATOR_OPTIONS.string
        return (
          <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, flexWrap:'wrap' }}>
            <select className="select" style={{ flex:'0 0 160px', fontSize:13 }} value={f.field} onChange={e => updateFilter(i, { field:e.target.value, operator:'equals', value:'' })}>
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="select" style={{ flex:'0 0 110px', fontSize:13 }} value={f.operator} onChange={e => updateFilter(i, { operator:e.target.value })}>
              {ops.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
            <input className="input" style={{ flex:1, minWidth:120, fontSize:13 }} placeholder="value" value={f.value} onChange={e => updateFilter(i, { value: e.target.value })} />
            <button onClick={() => removeFilter(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)', padding:'6px', display:'flex' }}><X size={16} /></button>
          </div>
        )
      })}
      <button onClick={addFilter} style={{ marginTop:4, background:'none', border:'1.5px dashed var(--border)', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:13, color:'var(--text2)', display:'flex', alignItems:'center', gap:6, fontFamily:'inherit' }}>
        <Plus size={14} /> Add row
      </button>
    </div>
  )
}

// ── Skeleton rows ──────────────────────────────────────────────
function SkeletonRows({ cols, count = 8 }) {
  return Array.from({ length:count }).map((_, i) => (
    <tr key={i}>
      {Array.from({ length:cols }).map((_, j) => (
        <td key={j} style={{ padding:'10px 14px' }}>
          <div style={{ height:14, borderRadius:6, background:'var(--border)', animation:'pulse 1.4s ease-in-out infinite', width: j === 0 ? '80%' : j % 3 === 0 ? '50%' : '65%' }} />
        </td>
      ))}
    </tr>
  ))
}

// ── Main DataExplorer ──────────────────────────────────────────
export default function AdminDataExplorer() {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL-persisted state
  const selectedTable  = searchParams.get('table')  || 'User'
  const urlPage        = Number(searchParams.get('page'))    || 1
  const urlPageSize    = Number(searchParams.get('pageSize')) || 25
  const urlFiltersRaw  = searchParams.get('filters') || '[]'
  const urlSortField   = searchParams.get('sortField') || ''
  const urlSortDir     = searchParams.get('sortDir')   || 'desc'

  let urlFilters = []
  try { urlFilters = JSON.parse(urlFiltersRaw) } catch {}

  const setParam = (patch) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') next.delete(k)
        else next.set(k, String(v))
      })
      return next
    })
  }

  // UI state
  const [tables,         setTables]         = useState([])
  const [rows,           setRows]           = useState([])
  const [total,          setTotal]          = useState(0)
  const [totalPages,     setTotalPages]     = useState(1)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState(null)
  const [analytics,      setAnalytics]      = useState(null)
  const [analyticsOpen,  setAnalyticsOpen]  = useState(false)
  const [analyticsLoad,  setAnalyticsLoad]  = useState(false)
  const [showFilter,     setShowFilter]     = useState(false)
  const [pendingFilters, setPendingFilters] = useState(urlFilters)
  const [showColPicker,  setShowColPicker]  = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [jumpPage,       setJumpPage]       = useState('')
  const [exporting,      setExporting]      = useState(false)

  // Derived column list — include relation objects (rendered as names), exclude arrays
  const allColumns = tables.find(t => t.name === selectedTable)?.keyFields || []
  const firstRowKeys = rows.length
    ? Object.keys(rows[0]).filter(k => !Array.isArray(rows[0][k]))
    : []
  const fullColList = firstRowKeys.length ? firstRowKeys : allColumns
  // Filter cols available in filter builder to scalars only (can't filter on relation objects)
  const scalarCols = firstRowKeys.filter(k => typeof rows[0]?.[k] !== 'object' || rows[0]?.[k] === null)

  const visibleColsKey = `explorer_cols_${selectedTable}`
  const [visibleCols, setVisibleCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem(visibleColsKey) || 'null') || null } catch { return null }
  })
  const displayCols = visibleCols || fullColList

  // Sync visible cols when table changes
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`explorer_cols_${selectedTable}`) || 'null')
      setVisibleCols(saved)
    } catch { setVisibleCols(null) }
  }, [selectedTable])

  const saveVisibleCols = cols => {
    setVisibleCols(cols)
    localStorage.setItem(`explorer_cols_${selectedTable}`, JSON.stringify(cols))
  }

  // Load tables list once
  useEffect(() => {
    api.get('/admin/explorer/tables').then(r => setTables(r.data.data?.tables || [])).catch(() => {})
  }, [])

  // Query whenever params change
  const runQuery = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.post('/admin/explorer/query', {
        table: selectedTable,
        filters: urlFilters,
        sort: urlSortField ? { field: urlSortField, direction: urlSortDir } : { field:'created_at', direction:'desc' },
        pagination: { page: urlPage, pageSize: urlPageSize },
      })
      const d = r.data.data
      setRows(d.rows || [])
      setTotal(d.total || 0)
      setTotalPages(d.totalPages || 1)
    } catch (e) {
      setError(e.response?.data?.error || 'Query failed')
    } finally { setLoading(false) }
  }, [selectedTable, urlFiltersRaw, urlSortField, urlSortDir, urlPage, urlPageSize])

  useEffect(() => { runQuery() }, [runQuery])

  // Analytics
  const loadAnalytics = () => {
    setAnalyticsLoad(true)
    api.get('/admin/explorer/analytics')
      .then(r => setAnalytics(r.data.data?.analytics || null))
      .catch(() => {})
      .finally(() => setAnalyticsLoad(false))
  }

  const toggleAnalytics = () => {
    if (!analyticsOpen && !analytics) loadAnalytics()
    setAnalyticsOpen(v => !v)
  }

  const applyFilters = () => {
    setParam({ filters: JSON.stringify(pendingFilters), page: '1' })
    setShowFilter(false)
  }

  const clearFilters = () => {
    setPendingFilters([])
    setParam({ filters: null, page: '1' })
    setShowFilter(false)
  }

  const handleSort = (field) => {
    if (urlSortField === field) {
      if (urlSortDir === 'asc') setParam({ sortDir: 'desc' })
      else if (urlSortDir === 'desc') setParam({ sortField: null, sortDir: null })
    } else {
      setParam({ sortField: field, sortDir: 'asc', page: '1' })
    }
  }

  const handleTableChange = (name) => {
    setPendingFilters([])
    setSearchParams({ table: name, page: '1', pageSize: String(urlPageSize) })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (urlFilters.length) params.set('filters', JSON.stringify(urlFilters))
      if (urlSortField) params.set('sort', JSON.stringify({ field: urlSortField, direction: urlSortDir }))
      const r = await api.get(`/admin/explorer/export/${selectedTable}?${params}`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url; a.download = `${selectedTable}-export.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch {}
    setExporting(false)
  }

  const SortIcon = ({ field }) => {
    if (urlSortField !== field) return <ChevronsUpDown size={13} style={{ color:'var(--text3)', opacity:.5 }} />
    return urlSortDir === 'asc' ? <ChevronUp size={13} style={{ color:'var(--accent)' }} /> : <ChevronDown size={13} style={{ color:'var(--accent)' }} />
  }

  const startRow = (urlPage - 1) * urlPageSize + 1
  const endRow   = Math.min(urlPage * urlPageSize, total)

  // Pagination page numbers
  const pageNums = () => {
    const pages = []
    const delta = 2
    for (let i = Math.max(1, urlPage - delta); i <= Math.min(totalPages, urlPage + delta); i++) pages.push(i)
    if (pages[0] > 1) { pages.unshift('…'); pages.unshift(1) }
    if (pages[pages.length - 1] < totalPages) { pages.push('…'); pages.push(totalPages) }
    return pages
  }

  const colPickerRef = useRef()

  return (
    <div>
      {/* Analytics bar */}
      <div style={{ marginBottom:16 }}>
        <button onClick={toggleAnalytics} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13.5, fontWeight:600, fontFamily:'inherit', color:'var(--text2)' }}>
          {analyticsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {analyticsOpen ? 'Hide Analytics' : 'Show Analytics'}
        </button>
        {analyticsOpen && (
          <div style={{ marginTop:12 }}>
            {analyticsLoad ? (
              <div style={{ display:'flex', justifyContent:'center', padding:24 }}><span className="spinner" style={{ width:24, height:24 }} /></div>
            ) : <AnalyticsBar analytics={analytics} />}
          </div>
        )}
      </div>

      {/* Table selector */}
      <div style={{ marginBottom:14, overflowX:'auto', paddingBottom:4 }} className="scroll">
        <div style={{ display:'flex', gap:6, width:'max-content' }}>
          {tables.map(t => (
            <button key={t.name} onClick={() => handleTableChange(t.name)} style={{ padding:'7px 15px', borderRadius:999, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, fontFamily:'inherit', whiteSpace:'nowrap', transition:'background .12s',
              background: selectedTable === t.name ? 'var(--accent)' : 'var(--bg2)',
              color:      selectedTable === t.name ? '#fff'          : 'var(--text2)',
            }}>
              {t.displayName}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        {/* Left */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, flexWrap:'wrap' }}>
          <button onClick={() => { setPendingFilters(urlFilters); setShowFilter(v => !v) }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit', color:'var(--text2)' }}>
            <Filter size={14} /> Add Filter
            {urlFilters.length > 0 && <span style={{ background:'var(--accent)', color:'#fff', borderRadius:999, minWidth:18, height:18, display:'grid', placeItems:'center', fontSize:11, fontWeight:700, padding:'0 5px' }}>{urlFilters.length}</span>}
          </button>

          {/* Active filter chips */}
          {urlFilters.map((f, i) => (
            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:999, background:'var(--accent-light)', color:'var(--accent)', fontSize:12, fontWeight:600 }}>
              {f.field} {f.operator} {Array.isArray(f.value) ? f.value.join(',') : f.value}
              <button onClick={() => {
                const next = urlFilters.filter((_, idx) => idx !== i)
                setParam({ filters: JSON.stringify(next), page:'1' })
                setPendingFilters(next)
              }} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', color:'var(--accent)' }}><X size={12} /></button>
            </span>
          ))}

          {urlFilters.length > 0 && (
            <button onClick={clearFilters} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--text3)', fontFamily:'inherit', textDecoration:'underline' }}>Clear all</button>
          )}
        </div>

        {/* Right */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <select className="select" style={{ fontSize:13 }} value={urlPageSize} onChange={e => setParam({ pageSize: e.target.value, page:'1' })}>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </select>

          <div style={{ position:'relative' }} ref={colPickerRef}>
            <button onClick={() => setShowColPicker(v => !v)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit', color:'var(--text2)' }}>
              <Columns size={14} /> Columns
            </button>
            {showColPicker && fullColList.length > 0 && (
              <ColumnPicker columns={fullColList} visible={displayCols} onChange={saveVisibleCols} onClose={() => setShowColPicker(false)} />
            )}
          </div>

          <button onClick={handleExport} disabled={exporting} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit', color:'var(--text2)', opacity: exporting ? .6 : 1 }}>
            <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>

          <button onClick={runQuery} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 11px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', color:'var(--text2)' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Filter builder */}
      {showFilter && (
        <div>
          <FilterBuilder columns={scalarCols.length ? scalarCols : allColumns} filters={pendingFilters} onChange={setPendingFilters} />
          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
            <button className="btn btn-primary btn-sm" onClick={applyFilters}>Apply Filters</button>
            <button className="btn btn-sm" onClick={() => setShowFilter(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Data table */}
      <div className="card" style={{ overflow:'hidden', padding:0 }}>
        {error ? (
          <div style={{ padding:48, textAlign:'center' }}>
            <AlertCircle size={28} style={{ color:'var(--danger)', marginBottom:8 }} />
            <div style={{ color:'var(--danger)', marginBottom:12 }}>{error}</div>
            <button onClick={runQuery} className="btn btn-sm">Retry</button>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }} className="scroll">
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--bg2)', borderBottom:'1.5px solid var(--border)' }}>
                  {(loading ? allColumns.slice(0, 6) : displayCols).map(col => (
                    <th key={col} onClick={() => handleSort(col)} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, fontSize:12, whiteSpace:'nowrap', cursor:'pointer', userSelect:'none', color:'var(--text2)' }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                        {col} <SortIcon field={col} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows cols={Math.max(displayCols.length, allColumns.length, 5)} />
                ) : rows.length === 0 ? (
                  <tr><td colSpan={displayCols.length || 5} style={{ padding:'56px 24px', textAlign:'center' }}>
                    <Table2 size={32} style={{ color:'var(--border)', marginBottom:12 }} />
                    <div style={{ color:'var(--text3)', fontSize:14 }}>No records found</div>
                    {urlFilters.length > 0 && <div style={{ color:'var(--text3)', fontSize:12, marginTop:4 }}>Try clearing your filters</div>}
                  </td></tr>
                ) : rows.map((row, ri) => (
                  <tr key={row.id || ri} onClick={() => setSelectedRecord(row)} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {displayCols.map(col => (
                      <td key={col} style={{ padding:'10px 14px', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {cellValue(row[col], col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!error && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:14, flexWrap:'wrap', gap:10 }}>
          <div style={{ color:'var(--text3)', fontSize:13 }}>
            {total > 0 ? `Showing ${startRow}–${endRow} of ${total.toLocaleString()} records` : `${total} records`}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <button onClick={() => setParam({ page: String(urlPage - 1) })} disabled={urlPage <= 1}
              style={{ padding:'6px 10px', borderRadius:7, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', color:'var(--text2)', display:'flex', opacity: urlPage <= 1 ? .4 : 1 }}>
              <ChevronLeft size={15} />
            </button>
            {pageNums().map((n, i) => (
              <button key={i} onClick={() => typeof n === 'number' && setParam({ page: String(n) })}
                disabled={n === '…'} style={{ padding:'5px 10px', borderRadius:7, fontSize:13, fontWeight:n === urlPage ? 700 : 500, fontFamily:'inherit', border:'1.5px solid var(--border)', cursor: n === '…' ? 'default' : 'pointer',
                  background: n === urlPage ? 'var(--accent)' : '#fff', color: n === urlPage ? '#fff' : 'var(--text2)' }}>
                {n}
              </button>
            ))}
            <button onClick={() => setParam({ page: String(urlPage + 1) })} disabled={urlPage >= totalPages}
              style={{ padding:'6px 10px', borderRadius:7, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', color:'var(--text2)', display:'flex', opacity: urlPage >= totalPages ? .4 : 1 }}>
              <ChevronRight size={15} />
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input value={jumpPage} onChange={e => setJumpPage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const n = Number(jumpPage); if (n >= 1 && n <= totalPages) { setParam({ page: String(n) }); setJumpPage('') } } }}
                placeholder="Go to…" style={{ width:70, padding:'6px 10px', borderRadius:7, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
            </div>
          </div>
        </div>
      )}

      {/* Record drawer */}
      <RecordDrawer record={selectedRecord} onClose={() => setSelectedRecord(null)} />

      <style>{`@keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }`}</style>
    </div>
  )
}
