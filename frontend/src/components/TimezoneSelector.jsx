import { useState, useRef, useEffect } from 'react'
import { Globe, ChevronDown, RotateCcw } from 'lucide-react'
import { COMMON_TIMEZONES, browserTz, tzLabel } from '../utils/timezone'

// Compact inline timezone selector with auto-detect
// Props:
//   value       — current IANA timezone string
//   onChange    — callback(newTz)
//   label       — optional label text (default "Timezone")
//   compact     — if true, shows only a small badge-style selector
export default function TimezoneSelector({ value, onChange, label = 'Timezone', compact = false }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = search
    ? COMMON_TIMEZONES.filter(t =>
        t.label.toLowerCase().includes(search.toLowerCase()) ||
        t.value.toLowerCase().includes(search.toLowerCase())
      )
    : COMMON_TIMEZONES

  const currentOption = COMMON_TIMEZONES.find(t => t.value === value)
  const displayLabel  = currentOption ? currentOption.label : (value || 'Select timezone')

  const detect = () => {
    const tz = browserTz()
    onChange(tz)
    setOpen(false)
  }

  if (compact) {
    return (
      <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            border: '1px solid var(--border2)', background: 'var(--bg2)',
            color: 'var(--text2)', fontSize: 12, cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}>
          <Globe size={11} />
          {displayLabel}
          <ChevronDown size={10} />
        </button>
        {open && (
          <DropdownPanel
            filtered={filtered}
            search={search}
            setSearch={setSearch}
            onChange={onChange}
            setOpen={setOpen}
            detect={detect}
          />
        )}
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && (
        <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
          <Globe size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />
          {label}
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px', borderRadius: 'var(--radius)', textAlign: 'left',
            border: '1px solid var(--border2)', background: 'var(--input-bg, #fff)',
            color: 'var(--text)', fontSize: 13.5, cursor: 'pointer',
          }}>
          <span>{displayLabel}</span>
          <ChevronDown size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
        </button>
        <button
          type="button"
          onClick={detect}
          title="Detect my timezone"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '9px 12px', borderRadius: 'var(--radius)',
            border: '1px solid var(--border2)', background: 'var(--bg2)',
            color: 'var(--text2)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
          <RotateCcw size={13} />
          Auto-detect
        </button>
      </div>
      {open && (
        <DropdownPanel
          filtered={filtered}
          search={search}
          setSearch={setSearch}
          onChange={onChange}
          setOpen={setOpen}
          detect={detect}
        />
      )}
      {value && (
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>
          {tzLabel(value)}
        </div>
      )}
    </div>
  )
}

function DropdownPanel({ filtered, search, setSearch, onChange, setOpen, detect }) {
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4,
      background: '#fff', border: '1px solid var(--border2)', borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-md)', maxHeight: 300, display: 'flex', flexDirection: 'column',
      minWidth: 280,
    }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <input
          autoFocus
          type="text"
          placeholder="Search timezones…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '5px 8px', fontSize: 12.5,
            border: '1px solid var(--border2)', borderRadius: 6,
            outline: 'none', background: 'var(--bg2)',
          }}
          onClick={e => e.stopPropagation()}
        />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <button
          type="button"
          onClick={detect}
          style={{
            width: '100%', padding: '9px 12px', textAlign: 'left',
            border: 'none', borderBottom: '1px solid var(--border)',
            background: 'var(--bg2)', color: 'var(--accent)',
            fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            fontWeight: 600,
          }}>
          <RotateCcw size={12} />
          Detect my timezone automatically
        </button>
        {filtered.map(tz => (
          <button
            key={tz.value}
            type="button"
            onClick={() => { onChange(tz.value); setOpen(false); setSearch('') }}
            style={{
              width: '100%', padding: '8px 12px', textAlign: 'left',
              border: 'none', borderBottom: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text)',
              fontSize: 12.5, cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            {tz.label}
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '12px', fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
            No timezones found
          </div>
        )}
      </div>
    </div>
  )
}
