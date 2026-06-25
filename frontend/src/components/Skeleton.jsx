// Skeleton shimmer components — use these during data fetch instead of blank areas.
// All match the platform's design tokens.

const shimmer = {
  background: 'linear-gradient(90deg, var(--border, #e8e4dc) 25%, var(--surface, #f5f1ea) 50%, var(--border, #e8e4dc) 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.4s ease infinite',
  borderRadius: 6,
}

export function SkeletonLine({ width = '100%', height = 14, style = {} }) {
  return (
    <div style={{ ...shimmer, width, height, ...style }} />
  )
}

export function SkeletonCard({ height = 120, style = {} }) {
  return (
    <div style={{
      ...shimmer,
      height,
      borderRadius: 12,
      ...style,
    }} />
  )
}

export function SkeletonText({ lines = 3, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
}

export function SkeletonAvatar({ size = 40, style = {} }) {
  return (
    <div style={{ ...shimmer, width: size, height: size, borderRadius: '50%', flexShrink: 0, ...style }} />
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* header */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, padding: '10px 16px' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} height={12} width="60%" />
        ))}
      </div>
      {/* rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
            padding: '12px 16px',
            background: r % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} height={14} width={c === 0 ? '80%' : '50%'} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Global keyframe — injected once
if (typeof document !== 'undefined' && !document.getElementById('skeleton-css')) {
  const style = document.createElement('style')
  style.id = 'skeleton-css'
  style.textContent = `@keyframes skeleton-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`
  document.head.appendChild(style)
}
