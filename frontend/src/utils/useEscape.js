import { useEffect } from 'react'

// Close a modal on Escape. Pass `active` so the listener only exists while open.
export default function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onClose])
}
