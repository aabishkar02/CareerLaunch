import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import usePageTitle from '../utils/usePageTitle'
import { ArrowRight, ArrowLeft, Star, Check, Clock, Lock, Sparkles, Shield, Folder, User } from 'lucide-react'

// ── Shared atoms ───────────────────────────────────────────────
const TINTS = {
  indigo: { bg: '#ecebfd', fg: 'var(--accent)' },
  violet: { bg: '#efeaff', fg: '#7c5cff' },
  blue:   { bg: '#e7effe', fg: '#2563eb' },
  teal:   { bg: '#e1f5f1', fg: '#0f9b8e' },
  amber:  { bg: '#fbf0db', fg: '#d98a1f' },
}
const TINT_KEYS = ['indigo', 'violet', 'indigo', 'blue', 'teal', 'violet', 'amber', 'blue']
const monoOf = (n = '') => (n.match(/\b[A-Z]/g) || []).join('').slice(0, 2).toUpperCase() || n.slice(0, 2).toUpperCase()

function ModTile({ mono, tint = 'indigo', size = 46 }) {
  const c = TINTS[tint] || TINTS.indigo
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0, letterSpacing: '-0.03em' }}>{mono}</div>
  )
}

function CreditPill({ amount, size = 'md' }) {
  const sm = size === 'sm'
  const lg = size === 'lg'
  const f  = sm ? 12.5 : lg ? 15 : 13.5
  const p  = sm ? '3px 9px' : lg ? '7px 14px' : '5px 11px'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: f, padding: p, borderRadius: 999, background: 'var(--credit-bg)', color: 'var(--credit)', border: '1px solid var(--credit-line)', flexShrink: 0 }}>
      <Star size={sm ? 13 : lg ? 17 : 15} fill="var(--credit)" strokeWidth={0} />
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{amount}</span>
      <span style={{ fontWeight: 600, opacity: 0.85 }}>{amount === 1 ? 'credit' : 'credits'}</span>
    </span>
  )
}

function StarRating({ value = 5, size = 13 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1.5 }}>
      {[0,1,2,3,4].map(i => <Star key={i} size={size} fill={i < Math.round(value) ? 'var(--credit)' : 'none'} strokeWidth={1.6} style={{ color: i < Math.round(value) ? 'var(--credit)' : 'var(--border)' }} />)}
    </span>
  )
}

function Avatar({ initials, tint = 'indigo', size = 30 }) {
  const c = TINTS[tint] || TINTS.indigo
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: size * 0.4, flexShrink: 0, letterSpacing: '-0.02em' }}>{initials}</div>
  )
}

// SubBar (sticky slim header)
function SubBar({ children }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(246,245,241,.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {children}
      </div>
    </header>
  )
}

// Floating review card
function FloatingReview({ r, style }) {
  if (!r) return null
  return (
    <div className="card" style={{ padding: '12px 14px', boxShadow: 'var(--shadow-md)', maxWidth: 250, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <Avatar initials={r.initials || (r.name || '').slice(0, 2).toUpperCase()} tint={r.tint || 'indigo'} size={30} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.name}</div>
          <div style={{ color: 'var(--text3)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.role || r.title}</div>
        </div>
      </div>
      <StarRating value={r.rating || r.stars || 5} size={11} />
      <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginTop: 7 }}>
        "{(r.text || r.review || '').slice(0, 88)}…"
      </p>
    </div>
  )
}

const STATIC_REVIEWS = [
  { name: 'Ethan Park',  role: 'New grad → SWE @ Stripe',          initials: 'EP', tint: 'indigo', rating: 5, text: 'Four sessions on system design and I went from blanking to leading the conversation. The offer came two weeks later.' },
  { name: 'Maya Chen',   role: 'Bootcamp grad → Frontend @ Figma',  initials: 'MC', tint: 'teal',   rating: 5, text: 'Having one mentor who actually remembered my goals week to week changed everything.' },
]

export default function PlanDetail() {
  usePageTitle('Plans & Pricing')
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
  const { planId } = useParams()

  const stateManagedPlan = location.state?.managedPlan
  const stateModule      = location.state?.module

  const [plans,       setPlans]       = useState([])
  const [reviews,     setReviews]     = useState(STATIC_REVIEWS)
  const [loading,     setLoading]     = useState(true)
  const [activePlanId, setActivePlanId] = useState(stateManagedPlan?.managedId || stateManagedPlan?.id || planId || null)
  const [isManagedMode, setIsManagedMode] = useState(!!stateManagedPlan)
  const [pickedModule, setPickedModule] = useState(stateModule || null)
  const [allModules,  setAllModules]  = useState([])

  useEffect(() => {
    Promise.all([
      api.get('/public/plans').catch(() => ({ data: { data: { plans: [] } } })),
      api.get('/onboarding/tutors').catch(() => ({ data: { data: { tutors: [] } } })),
      api.get('/public/modules').catch(() => ({ data: { data: { modules: [] } } })),
    ]).then(([pr, tr, mr]) => {
      const rawMods = mr.data.data?.modules || []
      setAllModules(rawMods.map((m, i) => ({
        id: m.id, name: m.name, blurb: m.short_description || '',
        credits: m.credit_cost, slug: m.slug,
        tint: TINT_KEYS[i % TINT_KEYS.length], mono: monoOf(m.name),
        outcomes: [],
      })))
      const managedPlans = pr.data.data?.plans || []
      // Build reviews from tutors
      const allRevs = []
      ;(tr.data.data?.tutors || []).forEach(t => {
        ;(t.reviews_received || []).forEach(r => allRevs.push({ name: r.student_name || 'Student', role: r.role || '', rating: r.rating, text: r.review || r.text || '', initials: (r.student_name || 'S').slice(0, 2).toUpperCase(), tint: 'indigo' }))
      })
      if (allRevs.length > 0) setReviews(allRevs.filter(r => r.rating >= 4).slice(0, 4))

      if (managedPlans.length > 0) {
        setIsManagedMode(true)
        const mapped = managedPlans.map((p, pi) => ({
          id: p.id, managedId: p.id, name: p.name, tagline: p.tagline || '',
          price: p.price_cents / 100, priceCents: p.price_cents,
          credits: (p.plan_modules || []).length > 0
            ? (p.plan_modules || []).reduce((s, pm) => s + (pm.credits_included || 0), 0)
            : (p.credits_per_module || 0),
          isRecommended: p.is_recommended, popular: p.is_recommended,
          includes: (() => { const n = (p.plan_modules || []).length; return `${n} module${n !== 1 ? 's' : ''}` })(),
          desc: p.description || p.tagline || '',
          outcomes: Array.isArray(p.whats_included) ? p.whats_included : [],
          modules: (p.plan_modules || []).map((pm, i) => ({
            id: pm.module?.id, name: pm.module?.name || '', blurb: pm.module?.short_description || '',
            credits: pm.credits_included,
            costPerSession: pm.module?.credit_cost,
            slug: pm.module?.slug,
            tint: TINT_KEYS[i % TINT_KEYS.length], mono: monoOf(pm.module?.name || ''),
          })).filter(m => m.id),
          single: (p.plan_modules || []).length === 0,
        }))
        setPlans(mapped)
        if (!activePlanId && mapped.length > 0) setActivePlanId(mapped.find(p => p.isRecommended)?.id || mapped[0]?.id)
      } else {
        api.get('/courses').then(r => {
          const PLAN_ORDER = { single: 0, starter: 1, professional: 2, complete: 3 }
          const all = r.data.data?.courses || []
          const legacy = all
            .filter(c => c.published && c.pricing_plans?.length > 0)
            .flatMap(c => c.pricing_plans.map(p => ({
              id: p.plan_type, courseId: c.id, slug: c.slug, name: c.title,
              price: p.price_cents / 100, priceCents: p.price_cents,
              tagline: c.description, desc: c.description,
              credits: p.credit_count || 0,
              includes: c.modules?.length ? `${c.modules.length} modules` : '',
              single: p.plan_type === 'single',
              modules: (c.modules || []).sort((a, b) => a.order_index - b.order_index).map((m, i) => ({
                id: m.id, name: m.title, blurb: m.description || '',
                credits: m.credit_cost, slug: m.slug,
                tint: TINT_KEYS[i % TINT_KEYS.length], mono: monoOf(m.title),
                outcomes: [],
              })),
            })))
            .sort((a, b) => (PLAN_ORDER[a.id] ?? 99) - (PLAN_ORDER[b.id] ?? 99))
          setPlans(legacy)
          if (!activePlanId && legacy.length > 0) setActivePlanId(legacy[0]?.id)
        }).catch(console.error)
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const selected = plans.find(p => p.id === activePlanId) || plans[0]
  const isSinglePlan = selected?.single

  const displayedModules = (isSinglePlan && isManagedMode)
    ? allModules
    : selected?.modules || []
  const outcomes = (selected?.outcomes || []).slice(0, 6)

  const handleBuy = () => {
    if (!selected) return
    const modToPass = isSinglePlan ? pickedModule : stateModule
    if (!user) {
      navigate('/register', { state: { redirect: '/checkout', plan: selected, module: modToPass, managedPlan: isManagedMode ? selected : null } })
      return
    }
    if (isManagedMode) navigate('/checkout', { state: { managedPlan: selected, module: isSinglePlan ? pickedModule : null } })
    else navigate('/checkout', { state: { plan: selected, module: modToPass } })
  }

  const priceNum = selected ? (typeof selected.price === 'number' ? selected.price : parseFloat(String(selected.price).replace(/[^0-9.]/g, ''))) : 0
  const priceStr = priceNum ? '$' + priceNum.toLocaleString('en-US') : '—'
  const perSession = selected?.credits ? Math.round(priceNum / selected.credits) : 0

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center' }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <SubBar>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', userSelect: 'none' }}>
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none"><path d="M16 1.5 19.4 12.6 30.5 16 19.4 19.4 16 30.5 12.6 19.4 1.5 16 12.6 12.6Z" fill="var(--accent)"/><path d="M16 8.5 17.7 14.3 23.5 16 17.7 17.7 16 23.5 14.3 17.7 8.5 16 14.3 14.3Z" fill="white" opacity=".82"/></svg>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.03em', color: 'var(--text)' }}>Career<span style={{ color: 'var(--accent)' }}>Launch</span></span>
        </Link>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> All plans
        </button>
      </SubBar>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '36px 28px 80px', display: 'grid', gridTemplateColumns: '1.4fr .9fr', gap: 40, alignItems: 'start' }} className="pd-grid">

        {/* ── Left ──────────────────────────────────────────── */}
        <div>
          {/* Plan tabs */}
          {plans.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {plans.map(p => (
                <button key={p.id} onClick={() => { setActivePlanId(p.id); setPickedModule(null) }} style={{
                  padding: '8px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                  background: selected?.id === p.id ? 'var(--accent)' : '#fff',
                  color:      selected?.id === p.id ? '#fff' : 'var(--text2)',
                  border:     selected?.id === p.id ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                {selected.includes && <span className="chip chip-soft">{selected.includes}</span>}
                {(selected.popular || selected.isRecommended) && (
                  <span className="chip" style={{ background: 'var(--text)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Sparkles size={12} /> Most popular
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: 46, letterSpacing: '-0.035em', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>{selected.name}</h1>
              <p style={{ fontSize: 18, color: 'var(--text2)', marginTop: 14, lineHeight: 1.6, maxWidth: 540 }}>{selected.desc || selected.tagline}</p>

              <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
                {selected.credits > 0 && <CreditPill amount={selected.credits} size="lg" />}
                {selected.credits > 0 && (
                  <span className="chip chip-line" style={{ fontSize: 14, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={15} /> {selected.credits} × 90-min sessions
                  </span>
                )}
              </div>

              {/* Module breakdown */}
              <h3 style={{ fontSize: 20, marginTop: 40, marginBottom: 4, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {isSinglePlan ? 'Choose your module' : "What's included"}
              </h3>
              <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 18 }}>
                {isSinglePlan ? 'Your plan covers any one module — pick where you want to go deep.' : 'Every module below is a full track of 1-on-1 sessions.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {displayedModules.map(m => {
                  const active = isSinglePlan ? pickedModule?.id === m.id : true
                  return (
                    <button key={m.id} onClick={() => isSinglePlan && setPickedModule(m)} className="card"
                      style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', cursor: isSinglePlan ? 'pointer' : 'default', transition: 'all .15s', border: 'none', outline: 'inherit',
                        borderWidth: active && isSinglePlan ? '1.5px' : '1px', borderStyle: 'solid',
                        borderColor: active && isSinglePlan ? 'var(--accent)' : 'var(--border)',
                        boxShadow: active && isSinglePlan ? '0 8px 20px -10px rgba(79,70,229,.4)' : 'var(--shadow-xs)',
                      }}>
                      <ModTile mono={m.mono} tint={m.tint} size={46} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15.5, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{m.name}</div>
                        {m.blurb && <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>{m.blurb}</div>}
                      </div>
                      {isSinglePlan ? (
                        <span style={{ width: 24, height: 24, borderRadius: '50%', border: active ? 'none' : '2px solid var(--border)', background: active ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          {active && <Check size={14} strokeWidth={2.6} style={{ color: '#fff' }} />}
                        </span>
                      ) : m.credits != null ? <CreditPill amount={m.credits} size="sm" /> : null}
                    </button>
                  )
                })}
              </div>

              {/* Outcomes strip */}
              {outcomes.length > 0 && (
                <div className="card" style={{ marginTop: 28, padding: 22, background: '#fbfaf7' }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Shield size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} /> What you walk away with
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}>
                    {outcomes.map((o, i) => (
                      <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5 }}>
                        <Check size={15} strokeWidth={2.2} style={{ color: 'var(--success)', flexShrink: 0 }} />{o}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: sticky purchase card + reviews ─────────── */}
        <div style={{ position: 'sticky', top: 92 }}>
          {selected && (
            <div className="card" style={{ padding: 24, boxShadow: 'var(--shadow-md)' }}>
              <div style={{ color: 'var(--text3)', fontSize: 13, fontWeight: 600 }}>One-time payment</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 44, letterSpacing: '-0.03em' }}>{priceStr}</span>
              </div>
              {perSession > 0 && <div style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: 2 }}>≈ ${perSession} per 90-min session</div>}
              <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '18px 0' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {[
                  [selected.credits > 0 ? `${selected.credits} credits` : 'Credits included', 'Star'],
                  [isSinglePlan ? '1 module, your pick' : selected.includes || `${displayedModules.length} modules`, 'modules'],
                  ['Dedicated mentor match', 'user'],
                  ['All materials & recordings', 'folder'],
                  ['Credits never expire', 'shield'],
                ].map(([text, ic], i) => {
                  const icons = { Star: <Star size={16} fill="var(--accent)" strokeWidth={0} />, modules: <Sparkles size={16} />, user: <User size={16} />, folder: <Folder size={16} />, shield: <Shield size={16} /> }
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5 }}>
                      <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{icons[ic]}</span>{text}
                    </div>
                  )
                })}
              </div>
              <button className="btn btn-primary btn-full btn-lg" style={{ marginTop: 22 }}
                disabled={isSinglePlan && !pickedModule}
                onClick={handleBuy}>
                {isSinglePlan && !pickedModule ? 'Pick a module above' : 'Buy this plan'} <ArrowRight size={18} />
              </button>
              <div style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Lock size={13} /> Secure checkout · 7-day refund
              </div>
            </div>
          )}

          {/* Floating reviews */}
          {reviews.length > 0 && (
            <div style={{ position: 'relative', marginTop: 18, height: 190 }}>
              <FloatingReview r={reviews[0]} style={{ position: 'absolute', top: 0, left: 0, right: 30 }} />
              {reviews[1] && <FloatingReview r={reviews[1]} style={{ position: 'absolute', top: 100, left: 30, right: 0 }} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
