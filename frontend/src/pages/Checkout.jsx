import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import usePageTitle from '../utils/usePageTitle'
import { ArrowLeft, Lock, CreditCard, User, Check, ShoppingCart } from 'lucide-react'

// ── Formatters ─────────────────────────────────────────────────
function fmtCard(v)   { return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim() }
function fmtExpiry(v) { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? d.slice(0, 2) + ' / ' + d.slice(2) : d }
function fmtCvc(v)    { return v.replace(/\D/g, '').slice(0, 4) }
function fmtMoney(n)  { return '$' + Number(n).toLocaleString('en-US') }

// ── SubBar ─────────────────────────────────────────────────────
function SubBar({ children }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(246,245,241,.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {children}
      </div>
    </header>
  )
}

// ── CreditPill ─────────────────────────────────────────────────
function CreditPill({ amount }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, padding: '3px 9px', borderRadius: 999, background: 'var(--credit-bg)', color: 'var(--credit)', border: '1px solid var(--credit-line)', flexShrink: 0 }}>
      <Check size={13} strokeWidth={2.5} />
      <span>{amount}</span>
    </span>
  )
}

// ── FieldError ─────────────────────────────────────────────────
function FieldError({ children }) {
  if (!children) return null
  return <div role="alert" style={{ fontSize: 13, color: 'var(--danger)', marginTop: 4 }}>{children}</div>
}

// ── Field wrapper ──────────────────────────────────────────────
function Field({ label, children, span }) {
  return (
    <div className="field" style={{ gridColumn: span ? '1 / -1' : 'auto' }}>
      <label>{label}</label>
      {children}
    </div>
  )
}

export default function Checkout() {
  usePageTitle('Checkout')
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const state     = useLocation().state || {}

  const { plan, module: selectedModule, coursePlan, managedPlan } = state
  const isManagedMode = !!managedPlan
  const hasOrder = !!(managedPlan || coursePlan || plan)

  const orderName  = managedPlan ? managedPlan.name  : coursePlan ? coursePlan.course?.title : plan?.name
  const orderDesc  = managedPlan ? (managedPlan.tagline || '') : coursePlan ? (coursePlan.plan?.description || '') : (plan?.desc || plan?.tagline || '')
  const rawPrice   = managedPlan ? managedPlan.priceCents / 100
                   : coursePlan  ? coursePlan.plan?.price_cents / 100
                   : typeof plan?.price === 'string' ? parseFloat(plan.price.replace(/[^0-9.]/g, '')) : plan?.price
  const orderPrice = rawPrice != null ? fmtMoney(rawPrice) : '—'
  const planCredits = managedPlan?.credits || plan?.credits || 0

  const moduleList = managedPlan?.modules || []

  const courseId = coursePlan ? coursePlan.course?.id : plan?.courseId
  const planType = coursePlan ? coursePlan.plan?.plan_type : plan?.id

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const [card, setCard] = useState({
    name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '',
    number: '', expiry: '', cvc: '',
  })
  const [cardErr, setCardErr] = useState({})

  const validate = () => {
    const errs = {}
    if (!card.name.trim())                            errs.name   = 'Name is required'
    if (card.number.replace(/\s/g,'').length < 13)   errs.number = 'Enter a valid card number'
    if (card.expiry.replace(/\D/g,'').length < 4)    errs.expiry = 'Enter MM / YY'
    if (card.cvc.length < 3)                         errs.cvc    = 'Enter your CVC'
    setCardErr(errs)
    return Object.keys(errs).length === 0
  }

  const handlePay = async () => {
    if (!validate()) return
    setError(''); setLoading(true)
    try {
      if (isManagedMode) {
        const r = await api.post('/payments/create-managed-intent', {
          planId: managedPlan.managedId || managedPlan.id,
          ...(selectedModule?.id ? { selectedModuleId: selectedModule.id } : {}),
        })
        await api.post('/payments/confirm-managed', { paymentIntentId: r.data.data.paymentIntentId })
      } else {
        const r = await api.post('/payments/create-intent', {
          courseId, planType,
          ...(planType === 'single' && selectedModule?.orderIndex ? { moduleOrderIndex: selectedModule.orderIndex } : {}),
        })
        await api.post('/payments/confirm', { paymentIntentId: r.data.data.paymentIntentId })
      }
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed. Please try again.')
    } finally { setLoading(false) }
  }

  const valid = card.name.trim().length > 0
    && card.number.replace(/\s/g,'').length >= 13
    && card.expiry.replace(/\D/g,'').length >= 4
    && card.cvc.length >= 3

  const tax   = rawPrice ? Math.round(rawPrice * 0.08 * 100) / 100 : 0
  const total = rawPrice ? rawPrice + tax : 0

  // ── No order in router state (e.g. page refresh) ───────────
  if (!hasOrder) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ maxWidth: 440, width: '100%', padding: 40, textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-light)', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
          <ShoppingCart size={28} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em' }}>No order selected</h1>
        <p style={{ color: 'var(--text2)', fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
          Your checkout session expired or the page was refreshed. Pick a plan to start again.
        </p>
        <button className="btn btn-primary btn-full" style={{ marginTop: 24 }} onClick={() => navigate('/plans')}>
          Browse plans
        </button>
      </div>
    </div>
  )

  // ── Success screen ─────────────────────────────────────────
  if (success) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ maxWidth: 460, width: '100%', padding: 40, textAlign: 'center', boxShadow: 'var(--shadow-lg)', animation: 'fadeIn .32s ease both' }}>
        <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--success-bg)', display: 'grid', placeItems: 'center', margin: '0 auto' }}>
          <Check size={40} strokeWidth={2.6} style={{ color: 'var(--success)' }} />
        </div>
        <h1 style={{ fontSize: 28, marginTop: 22, letterSpacing: '-0.03em', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
          You're all set{user?.first_name ? `, ${user.first_name}` : ''}!
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 15.5, marginTop: 10, lineHeight: 1.55 }}>
          Your <b style={{ color: 'var(--text)' }}>{orderName}</b> plan is active. Credits are ready — book your first session now.
        </p>
        {planCredits > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '22px 0' }}>
            <CreditPill amount={planCredits} />
          </div>
        )}
        <button className="btn btn-primary btn-full btn-lg" onClick={() => navigate('/dashboard')}>
          Go to my dashboard
        </button>
        <div style={{ color: 'var(--text3)', fontSize: 12.5, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          Receipt emailed to {user?.email || 'you'}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <SubBar>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none"><path d="M16 1.5 19.4 12.6 30.5 16 19.4 19.4 16 30.5 12.6 19.4 1.5 16 12.6 12.6Z" fill="var(--accent)"/><path d="M16 8.5 17.7 14.3 23.5 16 17.7 17.7 16 23.5 14.3 17.7 8.5 16 14.3 14.3Z" fill="white" opacity=".82"/></svg>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.03em', color: 'var(--text)' }}>Career<span style={{ color: 'var(--accent)' }}>Launch</span></span>
        </Link>
        <span style={{ color: 'var(--text3)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Lock size={14} /> Secure checkout
        </span>
      </SubBar>

      <div style={{ maxWidth: 940, margin: '0 auto', padding: '36px 28px 80px', display: 'grid', gridTemplateColumns: '1.2fr .85fr', gap: 36, alignItems: 'start' }} className="pay-grid">

        {/* ── Left: form ───────────────────────────────────── */}
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, paddingLeft: 0 }} onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back to plan
          </button>
          <h1 style={{ fontSize: 32, letterSpacing: '-0.03em', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Checkout</h1>
          <p style={{ color: 'var(--text3)', fontSize: 15, marginTop: 6 }}>
            Demo mode — no real card needed. Use any numbers.
          </p>

          {/* Card details */}
          <div className="card" style={{ padding: 24, marginTop: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={18} style={{ color: 'var(--accent)' }} /> Card details
            </div>
            <div className="form-grid-2">
              <Field label="Card number" span>
                <div style={{ position: 'relative' }}>
                  <input className="input" placeholder="4242 4242 4242 4242"
                    value={card.number} onChange={e => setCard(p => ({ ...p, number: fmtCard(e.target.value) }))}
                    style={{ paddingRight: 84 }} inputMode="numeric" autoComplete="cc-number" />
                  <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                    {['#1a1f71', '#eb001b', '#f79e1b'].map((c, i) => (
                      <div key={i} style={{ width: 26, height: 17, borderRadius: 4, background: c, opacity: i ? .9 : 1, marginLeft: i === 2 ? -10 : 0 }} />
                    ))}
                  </div>
                </div>
                <FieldError>{cardErr.number}</FieldError>
              </Field>
              <Field label="Expiry">
                <input className="input" placeholder="MM / YY"
                  value={card.expiry} onChange={e => setCard(p => ({ ...p, expiry: fmtExpiry(e.target.value) }))}
                  inputMode="numeric" autoComplete="cc-exp" />
                <FieldError>{cardErr.expiry}</FieldError>
              </Field>
              <Field label="CVC">
                <input className="input" placeholder="123" type="password"
                  value={card.cvc} onChange={e => setCard(p => ({ ...p, cvc: fmtCvc(e.target.value) }))}
                  inputMode="numeric" autoComplete="cc-csc" />
                <FieldError>{cardErr.cvc}</FieldError>
              </Field>
            </div>
          </div>

          {/* Billing details */}
          <div className="card" style={{ padding: 24, marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={18} style={{ color: 'var(--accent)' }} /> Billing details
            </div>
            <div className="form-grid-2">
              <Field label="Full name" span>
                <input className="input"
                  value={card.name} onChange={e => setCard(p => ({ ...p, name: e.target.value }))}
                  autoComplete="name" />
                <FieldError>{cardErr.name}</FieldError>
              </Field>
              <Field label="Email" span>
                <input className="input" type="email" defaultValue={user?.email || ''} autoComplete="email" readOnly />
              </Field>
            </div>
          </div>
        </div>

        {/* ── Right: order summary ─────────────────────────── */}
        <div style={{ position: 'sticky', top: 92 }}>
          <div className="card" style={{ padding: 24, boxShadow: 'var(--shadow-md)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Order summary</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <CreditCard size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{orderName}</div>
                <div style={{ color: 'var(--text3)', fontSize: 13 }}>{orderDesc || (planCredits > 0 ? `${planCredits} credits` : '')}</div>
              </div>
              {planCredits > 0 && <CreditPill amount={planCredits} />}
            </div>

            {/* Module tags */}
            {moduleList.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                {moduleList.map((m, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 999, fontSize: 11.5, fontWeight: 600 }}>
                    <Check size={10} />{m.name || m}
                  </span>
                ))}
              </div>
            )}

            {selectedModule && (
              <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)' }}>
                Module: <b style={{ color: 'var(--accent)' }}>{selectedModule.name || selectedModule.title}</b>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '16px 0', fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>Subtotal</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)' }}>{orderPrice}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>Estimated tax (8%)</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)' }}>{tax ? fmtMoney(tax) : '—'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Total</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em' }}>
                {total ? fmtMoney(total) : orderPrice}
              </span>
            </div>

            {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}

            <button className="btn btn-primary btn-full btn-lg" style={{ marginTop: 20 }}
              disabled={!valid || loading} onClick={handlePay}>
              {loading
                ? <><span className="spinner" /> Processing…</>
                : <><Lock size={16} /> Pay {total ? fmtMoney(total) : orderPrice}</>}
            </button>
            <div style={{ color: 'var(--text3)', fontSize: 11.5, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
              Powered by Stripe (simulated). By paying you agree to CareerLaunch's terms.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
