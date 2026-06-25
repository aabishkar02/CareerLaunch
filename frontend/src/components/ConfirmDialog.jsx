import { useState, useEffect, useRef, useCallback } from 'react'

// Promise-based replacement for window.confirm — styled, accessible.
// Usage: if (!(await confirmDialog('Delete this?'))) return
// Mount <ConfirmDialog /> once at the app root.

const CONFIRM_EVENT = 'app:confirm'

export function confirmDialog(message, { title = 'Are you sure?', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, {
      detail: { message, title, confirmLabel, cancelLabel, danger, resolve },
    }))
  })
}

export default function ConfirmDialog() {
  const [req, setReq] = useState(null)
  const confirmRef = useRef(null)

  useEffect(() => {
    const handler = (e) => setReq(e.detail)
    window.addEventListener(CONFIRM_EVENT, handler)
    return () => window.removeEventListener(CONFIRM_EVENT, handler)
  }, [])

  const close = useCallback((answer) => {
    setReq(prev => {
      prev?.resolve(answer)
      return null
    })
  }, [])

  useEffect(() => {
    if (!req) return
    confirmRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req, close])

  if (!req) return null

  return (
    <div
      onClick={() => close(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(24,23,31,.45)', zIndex: 10000, display: 'grid', placeItems: 'center', padding: 20 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={req.title}
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 400, width: '100%', padding: 24, boxShadow: 'var(--shadow-lg)', animation: 'fadeIn .15s ease both' }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{req.title}</div>
        <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{req.message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button className="btn btn-outline btn-sm" onClick={() => close(false)}>{req.cancelLabel}</button>
          <button
            ref={confirmRef}
            className="btn btn-sm"
            onClick={() => close(true)}
            style={req.danger
              ? { background: 'var(--danger)', color: '#fff' }
              : { background: 'var(--accent)', color: '#fff' }}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
