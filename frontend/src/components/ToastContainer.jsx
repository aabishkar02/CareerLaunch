import { useState, useEffect, useCallback } from 'react'
import { TOAST_EVENT } from '../services/toast'

const COLORS = {
  error:   { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  success: { bg: '#dcfce7', border: '#86efac', text: '#166534' },
  info:    { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
}

const AUTO_DISMISS_MS = 5000

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    const handler = (e) => {
      const toast = e.detail
      setToasts(prev => [...prev.slice(-4), toast]) // max 5 toasts
      setTimeout(() => remove(toast.id), AUTO_DISMISS_MS)
    }
    window.addEventListener(TOAST_EVENT, handler)
    return () => window.removeEventListener(TOAST_EVENT, handler)
  }, [remove])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position:  'fixed',
      bottom:    24,
      right:     24,
      zIndex:    9999,
      display:   'flex',
      flexDirection: 'column',
      gap:       8,
      maxWidth:  380,
    }}>
      {toasts.map(t => {
        const c = COLORS[t.type] || COLORS.info
        return (
          <div
            key={t.id}
            style={{
              background:   c.bg,
              border:       `1px solid ${c.border}`,
              color:        c.text,
              borderRadius: 8,
              padding:      '12px 16px',
              fontSize:     13,
              fontWeight:   500,
              display:      'flex',
              alignItems:   'flex-start',
              gap:          10,
              boxShadow:    '0 4px 12px rgba(0,0,0,0.08)',
              animation:    'slideIn 0.15s ease',
            }}
          >
            <span style={{ flex: 1, lineHeight: 1.5 }}>{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text, fontSize: 16, lineHeight: 1, padding: 0, opacity: 0.6 }}
            >
              ×
            </button>
          </div>
        )
      })}
      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
