import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import {
  ArrowRight, Star, Check, Plus, X,
  User, Shield, Folder, Calendar, Clock, Sparkles,
} from 'lucide-react'

// ── Tint palette ──────────────────────────────────────────────────
const TINTS = {
  indigo: { bg: '#ecebfd', fg: 'var(--accent)' },
  violet: { bg: '#efeaff', fg: '#7c5cff' },
  blue:   { bg: '#e7effe', fg: '#2563eb' },
  teal:   { bg: '#e1f5f1', fg: '#0f9b8e' },
  amber:  { bg: '#fbf0db', fg: '#d98a1f' },
}
const TINT_KEYS = ['indigo', 'violet', 'indigo', 'blue', 'teal', 'violet', 'amber', 'blue']
const monoOf = (name = '') =>
  (name.match(/\b[A-Z]/g) || []).join('').slice(0, 2).toUpperCase() ||
  name.slice(0, 2).toUpperCase()

// ── Shared atoms ───────────────────────────────────────────────────

function Avatar({ initials, tint = 'indigo', size = 40, ring = false }) {
  const c = TINTS[tint] || TINTS.indigo
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: c.bg, color: c.fg,
      display: 'grid', placeItems: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: size * 0.4, flexShrink: 0,
      boxShadow: ring ? `0 0 0 3px #fff, 0 0 0 4px ${c.bg}` : 'none',
      letterSpacing: '-0.02em',
    }}>{initials}</div>
  )
}

function ModTile({ mono, tint = 'indigo', size = 48 }) {
  const c = TINTS[tint] || TINTS.indigo
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: c.bg, color: c.fg,
      display: 'grid', placeItems: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0,
      letterSpacing: '-0.03em',
    }}>{mono}</div>
  )
}

function CreditPill({ amount, label = true, size = 'md' }) {
  const sm = size === 'sm'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontWeight: 700, fontSize: sm ? 12.5 : 13.5,
      padding: sm ? '3px 9px' : '5px 11px',
      borderRadius: 999,
      background: 'var(--credit-bg)', color: 'var(--credit)',
      border: '1px solid var(--credit-line)',
      flexShrink: 0,
    }}>
      <Star size={sm ? 13 : 15} fill="var(--credit)" strokeWidth={0} />
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{amount}</span>
      {label && <span style={{ fontWeight: 600, opacity: 0.85 }}>{amount === 1 ? 'credit' : 'credits'}</span>}
    </span>
  )
}

function StarRating({ value = 5, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1.5 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <Star key={i} size={size}
          fill={i < Math.round(value) ? 'var(--credit)' : 'none'}
          strokeWidth={1.6}
          style={{ color: i < Math.round(value) ? 'var(--credit)' : 'var(--border)' }} />
      ))}
    </span>
  )
}

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]:not(.in)')
    const io = new IntersectionObserver(ents => {
      ents.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  })
}

// ── Logo ───────────────────────────────────────────────────────────
function Logo({ light = false, onClick }) {
  const ink = light ? '#fff' : 'var(--text)'
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: onClick ? 'pointer' : 'default', userSelect: 'none' }}>
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
        <path d="M16 1.5 19.4 12.6 30.5 16 19.4 19.4 16 30.5 12.6 19.4 1.5 16 12.6 12.6Z" fill="var(--accent)"/>
        <path d="M16 8.5 17.7 14.3 23.5 16 17.7 17.7 16 23.5 14.3 17.7 8.5 16 14.3 14.3Z" fill="white" opacity={light ? 0.9 : 0.82}/>
      </svg>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.03em', color: ink, whiteSpace: 'nowrap' }}>
        Career<span style={{ color: 'var(--accent)' }}>Launch</span>
      </span>
    </div>
  )
}

// ── Landing Navbar ─────────────────────────────────────────────────
function LandingNavbar({ onScrollTo }) {
  const { user, getRedirect } = useAuth()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', fn, { passive: true })
    fn()
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: scrolled ? 'rgba(246,245,241,.88)' : 'transparent',
      backdropFilter: scrolled ? 'blur(14px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(14px)' : 'none',
      borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
      transition: 'all .25s ease',
    }}>
      <div style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 28px', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo onClick={() => navigate('/')} />
        <nav className="landing-nav-links">
          {[['Modules', 'modules'], ['Plans', 'plans'], ['Reviews', 'reviews'], ['FAQ', 'faq']].map(([label, id]) => (
            <a key={id} onClick={() => onScrollTo(id)}
              style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', padding: '6px 2px' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text2)'}>{label}</a>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user ? (
            <Link to={getRedirect(user)} className="btn btn-primary btn-sm">Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">Sign in</Link>
              <button className="btn btn-primary btn-sm" onClick={() => onScrollTo('plans')}>Get started</button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

// ── Hero visual (floating cards) ───────────────────────────────────
function HeroVisual() {
  return (
    <div className="landing-hero-visual" style={{ position: 'relative', height: 440 }}>
      {/* glow */}
      <div style={{ position: 'absolute', inset: '-10% -6% 0 8%', background: 'radial-gradient(60% 60% at 70% 30%, rgba(124,92,255,.20), transparent 70%), radial-gradient(50% 50% at 30% 70%, rgba(79,70,229,.18), transparent 70%)', filter: 'blur(8px)', pointerEvents: 'none' }} />

      {/* main session card */}
      <div style={{ position: 'absolute', top: 44, left: 20, right: 44, padding: 22, borderRadius: 22, background: '#fff', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span className="chip chip-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} style={{ flexShrink: 0 }} /> Next session
          </span>
          <CreditPill amount={1} size="sm" />
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar initials="DO" tint="indigo" size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Daniel Okafor</div>
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>System Design · Ex-Google</div>
          </div>
          <StarRating value={5} size={13} />
        </div>
        <div style={{ marginTop: 16, padding: '12px 14px', background: '#fbfaf7', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>Mon, Jun 8 · 3:00 PM</span>
          <span style={{ color: 'var(--text3)', fontSize: 13.5 }}>· 90 min</span>
          <span className="chip chip-good" style={{ marginLeft: 'auto' }}>Confirmed</span>
        </div>
      </div>

      {/* floating mentor stack */}
      <div style={{ position: 'absolute', bottom: 14, right: 4, padding: '14px 16px', borderRadius: 18, background: '#fff', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex' }}>
          {[['PN', 'violet'], ['MB', 'blue'], ['AK', 'teal']].map(([ini, t], k) => (
            <div key={k} style={{ marginLeft: k ? -10 : 0 }}>
              <Avatar initials={ini} tint={t} size={34} ring />
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>40+ mentors</div>
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>ready this week</div>
        </div>
      </div>

      {/* credit balance float */}
      <div style={{ position: 'absolute', top: -6, right: -6, padding: '12px 16px', borderRadius: 16, background: '#fff', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, color: 'var(--credit)', letterSpacing: '-0.03em' }}>16</div>
        <div style={{ color: 'var(--text3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }}>credits left</div>
      </div>
    </div>
  )
}

// ── Hero ───────────────────────────────────────────────────────────
function Hero({ onScrollTo }) {
  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="landing-hero" style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '44px 28px 70px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px', background: '#fff', border: '1px solid var(--border)', borderRadius: 999, fontSize: 13, fontWeight: 600, color: 'var(--text2)', boxShadow: 'var(--shadow-xs)', marginBottom: 22 }}>
            <span className="chip chip-soft" style={{ padding: '2px 8px', fontSize: 11.5 }}>New</span>
            1-on-1 mentorship, not another course library
          </div>
          <h1 style={{ fontSize: 'clamp(40px,5.5vw,60px)', lineHeight: 1.02, letterSpacing: '-0.035em', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>
            Land the offer.<br />With a mentor<br />who's{' '}
            <span style={{ color: 'var(--accent)', position: 'relative', display: 'inline-block' }}>
              done it
              <svg width="100%" height="14" viewBox="0 0 200 14" preserveAspectRatio="none"
                style={{ position: 'absolute', left: 0, bottom: -6, width: '100%', display: 'block' }}>
                <path d="M3 9C40 3 160 3 197 8" stroke="var(--credit)" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
              </svg>
            </span>.
          </h1>
          <p style={{ fontSize: 19, color: 'var(--text2)', marginTop: 24, maxWidth: 480, lineHeight: 1.55 }}>
            Private sessions with coaches who've hired at the companies you're chasing. Buy a plan, get credits, and book real prep — resume to offer.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 30, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-lg" onClick={() => onScrollTo('plans')}>
              Browse plans <ArrowRight size={18} />
            </button>
            <button className="btn btn-outline btn-lg" onClick={() => onScrollTo('modules')}>
              Explore modules
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 30 }}>
            <StarRating value={5} size={15} />
            <span style={{ fontSize: 14, color: 'var(--text2)' }}>
              <b style={{ color: 'var(--text)' }}>4.9</b> from 1,200+ students placed at top companies
            </span>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>
  )
}

// ── Features ───────────────────────────────────────────────────────
const FEATURES = [
  { title: '1-on-1, never 1-to-many', body: 'Every session is private. Your mentor prepares for you, not a cohort of 200.', I: User },
  { title: 'Credit-based scheduling', body: '1 credit = a 90-minute session. Spend them whenever you\'re ready — no expiry pressure.', I: Star },
  { title: 'Mentors from the inside', body: "Coaches who've sat on the other side of the table at the companies you're targeting.", I: Shield },
  { title: 'Prep that travels with you', body: 'Recordings, notes, and materials live in your dashboard the moment a session ends.', I: Folder },
]

function Features() {
  return (
    <section style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '10px 28px 40px' }}>
      <div className="grid-4" style={{ gap: 16 }}>
        {FEATURES.map((f, i) => (
          <div key={i} data-reveal className="card" style={{ padding: 22, transitionDelay: (i * 60) + 'ms' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
              <f.I size={21} strokeWidth={1.7} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 5, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{f.title}</div>
            <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5 }}>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Section head ───────────────────────────────────────────────────
function SectionHead({ eyebrow, title, sub, id }) {
  return (
    <div id={id} style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 40px', scrollMarginTop: 90 }}>
      <div className="eyebrow" data-reveal>{eyebrow}</div>
      <h2 data-reveal style={{ fontSize: 'clamp(28px,4vw,40px)', marginTop: 12, letterSpacing: '-0.03em', transitionDelay: '60ms', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{title}</h2>
      {sub && <p data-reveal style={{ fontSize: 17, color: 'var(--text2)', marginTop: 14, lineHeight: 1.55, transitionDelay: '120ms' }}>{sub}</p>}
    </div>
  )
}

// ── Modules ────────────────────────────────────────────────────────
function ModulesSection({ modules, onModuleClick }) {
  return (
    <section style={{ background: '#fff', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '76px 0' }}>
      <div style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 28px' }}>
        <SectionHead id="modules" eyebrow="What we coach" title="Eight modules. One offer."
          sub="Each module is a focused track of 1-on-1 sessions. Mix and match, or take the full journey." />
        <div className="grid-4" style={{ gap: 16 }}>
          {modules.map((m, i) => {
            const tint = m.tint || TINT_KEYS[i % TINT_KEYS.length]
            const mono = m.mono || monoOf(m.name || m.title || '')
            const name = m.name || m.title || ''
            const blurb = m.blurb || m.desc || m.short_description || ''
            const credits = m.credits ?? m.credit_cost
            return (
              <button key={m.id ?? i} data-reveal
                onClick={() => onModuleClick(m)}
                className="card"
                style={{ padding: 20, textAlign: 'left', transitionDelay: (i % 4 * 50) + 'ms', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'transform .15s ease, box-shadow .15s ease', border: 'none', outline: 'inherit' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <ModTile mono={mono} tint={tint} size={44} />
                  {credits != null && <CreditPill amount={credits} size="sm" label={false} />}
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', marginBottom: 6 }}>{name}</div>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, flex: 1, margin: 0 }}>{blurb}</p>
                {m.cat && <div className="chip" style={{ marginTop: 14, alignSelf: 'flex-start', background: '#efede7' }}>{m.cat}</div>}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Plans ──────────────────────────────────────────────────────────
function PlanCard({ plan, onBuy, featured }) {
  const rawPrice = plan.price ?? (plan.priceCents != null ? plan.priceCents / 100 : null)
  const priceStr = rawPrice != null
    ? (typeof rawPrice === 'string' ? rawPrice : '$' + Number(rawPrice).toLocaleString('en-US'))
    : ''
  const lines = plan.single
    ? ['Any 1 module of your choice', '4 × 90-minute sessions', 'Dedicated mentor match', 'All module materials']
    : (plan.whats_included?.length ? plan.whats_included : (plan.modules || []).map(m => (typeof m === 'string' ? m : (m?.name || ''))))

  return (
    <div data-reveal className="card" style={{
      padding: 26, position: 'relative', display: 'flex', flexDirection: 'column',
      border: featured ? '1.5px solid var(--accent)' : '1px solid var(--border)',
      boxShadow: featured ? '0 24px 50px -20px rgba(79,70,229,.4)' : 'var(--shadow-sm)',
      background: featured ? 'linear-gradient(180deg,#f4f3fe,#fff 30%)' : '#fff',
    }}>
      {(featured || plan.badge_label) && (
        <div className="chip chip-soft" style={{
          position: 'absolute', top: -12, left: 26,
          background: 'var(--accent)', color: '#fff', fontWeight: 700,
          boxShadow: 'var(--shadow-sm)', display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <Sparkles size={12} /> {plan.badge_label || 'Most popular'}
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 19, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>{plan.name}</div>
      {plan.tagline && <div style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: 2 }}>{plan.tagline}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 18 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 38, letterSpacing: '-0.03em' }}>{priceStr}</span>
        <span style={{ color: 'var(--text3)', fontSize: 14 }}>one-time</span>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {plan.credits != null && <CreditPill amount={plan.credits} />}
        {plan.includes && <span className="chip chip-line">{plan.includes}</span>}
      </div>
      {plan.description && (
        <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6, margin: '14px 0 10px' }}>{plan.description}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 22, flex: 1 }}>
        {lines.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5 }}>
            <Check size={15} strokeWidth={2.2} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            {item}
          </div>
        ))}
      </div>
      <button
        className={'btn btn-full ' + (featured ? 'btn-primary' : 'btn-outline')}
        style={{ marginTop: 'auto' }}
        onClick={() => onBuy(plan)}>
        {featured ? 'Get started' : 'View plan'}<ArrowRight size={16} />
      </button>
    </div>
  )
}

function PlansSection({ plans, onBuy }) {
  return (
    <section style={{ padding: '76px 0' }}>
      <div style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 28px' }}>
        <SectionHead id="plans" eyebrow="Pricing" title="Pick your path"
          sub="One module or the whole journey. Every plan is credits you spend on real, private sessions." />
        <div className="grid-4" style={{ gap: 18, alignItems: 'stretch' }}>
          {plans.map(p => (
            <PlanCard key={p.id ?? p.managedId} plan={p} onBuy={onBuy} featured={!!(p.popular || p.isRecommended)} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Reviews ────────────────────────────────────────────────────────
const STATIC_REVIEWS = [
  { name: 'Ethan Park',    role: 'New grad → SWE @ Stripe',              initials: 'EP', tint: 'indigo', rating: 5, text: 'Four sessions on system design and I went from blanking to leading the conversation. The offer came two weeks later.' },
  { name: 'Lena Vasquez',  role: 'Career switcher → PM @ Notion',         initials: 'LV', tint: 'violet', rating: 5, text: 'My mentor rewrote how I think about my resume. Callbacks went from zero in three months to four in one week.' },
  { name: 'Tomás Greco',   role: 'Senior year → Analyst @ BlackRock',     initials: 'TG', tint: 'blue',   rating: 5, text: 'The negotiation module paid for the whole plan ten times over. I asked for more and they said yes without blinking.' },
  { name: 'Maya Chen',     role: 'Bootcamp grad → Frontend @ Figma',      initials: 'MC', tint: 'teal',   rating: 5, text: 'Having one mentor who actually remembered my goals week to week changed everything. It never felt like a script.' },
  { name: 'Olu Adeyemi',   role: "Master's → Data Sci @ Spotify",         initials: 'OA', tint: 'amber',  rating: 4, text: 'Behavioral prep was brutal in the best way. Every mock made the real thing feel easy.' },
  { name: 'Hannah Brooks', role: 'Returning to work → UX @ Atlassian',    initials: 'HB', tint: 'indigo', rating: 5, text: 'I was terrified to start applying again. My coach gave me a 90-day plan and the confidence to work it.' },
]

function ReviewsSection() {
  return (
    <section style={{ background: '#18171f', color: '#fff', padding: '80px 0', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-20%', right: '-5%', width: 460, height: 460, background: 'radial-gradient(circle, rgba(124,92,255,.32), transparent 65%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 28px', position: 'relative' }}>
        <div id="reviews" style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 44px', scrollMarginTop: 90 }}>
          <div className="eyebrow" data-reveal style={{ color: '#7c5cff' }}>Outcomes</div>
          <h2 data-reveal style={{ fontSize: 'clamp(28px,4vw,40px)', marginTop: 12, color: '#fff', letterSpacing: '-0.03em', transitionDelay: '60ms', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Offers, not just advice
          </h2>
        </div>
        <div className="landing-rev-grid">
          {STATIC_REVIEWS.map((r, i) => (
            <div key={i} data-reveal style={{
              breakInside: 'avoid', marginBottom: 18,
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 18, padding: 22, transitionDelay: (i % 3 * 70) + 'ms',
            }}>
              <StarRating value={r.rating} size={14} />
              <p style={{ fontSize: 15, lineHeight: 1.6, margin: '14px 0 18px', color: 'rgba(255,255,255,.92)' }}>"{r.text}"</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar initials={r.initials} tint={r.tint} size={38} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                  <div style={{ fontSize: 12.5, color: '#7c5cff', fontWeight: 600 }}>{r.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── FAQ ────────────────────────────────────────────────────────────
function FAQItem({ item, open, onToggle }) {
  return (
    <div className="card" style={{ overflow: 'hidden', boxShadow: open ? 'var(--shadow-sm)' : 'var(--shadow-xs)' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '18px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ fontWeight: 700, fontSize: 15.5, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
          {item.q || item.question}
        </span>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: open ? 'var(--accent)' : '#efede7', color: open ? '#fff' : 'var(--text2)', display: 'grid', placeItems: 'center', flexShrink: 0, transition: 'all .2s' }}>
          {open ? <X size={15} strokeWidth={2.2} /> : <Plus size={15} strokeWidth={2.2} />}
        </span>
      </button>
      <div style={{ maxHeight: open ? 300 : 0, transition: 'max-height .3s ease', overflow: 'hidden' }}>
        <p style={{ padding: '0 20px 20px', fontSize: 14.5, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
          {item.a || item.answer}
        </p>
      </div>
    </div>
  )
}

function FAQSection({ faqs }) {
  const [open, setOpen] = useState(0)
  if (faqs.length === 0) return null
  return (
    <section style={{ padding: '76px 0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px' }}>
        <SectionHead id="faq" eyebrow="Questions" title="Good to know" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqs.map((f, i) => (
            <FAQItem key={i} item={f} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Contact CTA ────────────────────────────────────────────────────
function ContactCTA() {
  const navigate = useNavigate()
  return (
    <section style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '10px 28px 80px' }}>
      <div data-reveal style={{
        padding: 'clamp(36px,5vw,52px) clamp(28px,4vw,48px)', borderRadius: 28, textAlign: 'center',
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--accent), #7c5cff)',
        boxShadow: '0 30px 60px -24px rgba(79,70,229,.55)',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 100% at 100% 0%, rgba(255,255,255,.18), transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <h2 style={{ fontSize: 'clamp(26px,3.5vw,38px)', color: '#fff', letterSpacing: '-0.03em', maxWidth: 560, margin: '0 auto', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Your next offer starts with one conversation
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,.9)', marginTop: 14, maxWidth: 460, margin: '14px auto 0', lineHeight: 1.55 }}>
            Not sure which plan fits? Tell us where you are and we'll point you to the right mentor.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
            <button className="btn btn-lg" style={{ background: '#fff', color: 'var(--accent)', fontWeight: 600 }}
              onClick={() => navigate('/register')}>
              Get started today
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Footer ─────────────────────────────────────────────────────────
function Footer() {
  const navigate = useNavigate()
  const scrollTo = id => {
    const el = document.getElementById(id)
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' })
  }
  const col = (title, items) => (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text3)', marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(([label, action], i) => (
          <a key={i} onClick={action} style={{ fontSize: 14, color: 'var(--text2)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text2)'}>{label}</a>
        ))}
      </div>
    </div>
  )
  return (
    <footer style={{ background: '#fff', borderTop: '1px solid var(--border)', padding: '56px 0 30px' }}>
      <div style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 28px' }}>
        <div className="landing-footer-grid">
          <div>
            <Logo />
            <p style={{ fontSize: 14, color: 'var(--text2)', marginTop: 14, maxWidth: 280, lineHeight: 1.6 }}>
              1-on-1 career mentorship that takes you from first draft to signed offer.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              {['in', 'X', 'IG'].map(s => (
                <div key={s} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text2)', cursor: 'pointer', userSelect: 'none' }}>{s}</div>
              ))}
            </div>
          </div>
          {col('Product', [
            ['Modules',  () => scrollTo('modules')],
            ['Plans',    () => scrollTo('plans')],
            ['Reviews',  () => scrollTo('reviews')],
            ['FAQ',      () => scrollTo('faq')],
          ])}
          {col('Portals', [
            ['Student login',  () => navigate('/login')],
            ['Tutor portal',   () => navigate('/login')],
          ])}
          {col('Company', [
            ['About',    () => {}],
            ['Careers',  () => {}],
            ['Contact',  () => scrollTo('faq')],
            ['Privacy',  () => {}],
          ])}
        </div>
        <hr style={{ height: 1, background: 'var(--border)', border: 0, margin: '36px 0 20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, fontSize: 13, color: 'var(--text3)' }}>
          <span>© 2026 CareerLaunch, Inc.</span>
          <span>Made for students chasing their first big offer.</span>
        </div>
      </div>
    </footer>
  )
}

// ── Main Landing component ─────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate()
  const [faqs,    setFaqs]    = useState([])
  const [plans,   setPlans]   = useState([])
  const [modules, setModules] = useState([])

  useReveal()

  const onScrollTo = useCallback(id => {
    const el = document.getElementById(id)
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    document.title = 'CareerLaunch — Expert 1-on-1 Mentorship'

    api.get('/faqs').then(r => {
      const loaded = r.data.data?.faqs || []
      if (loaded.length > 0) setFaqs(loaded)
    }).catch(() => {})

    Promise.all([
      api.get('/public/modules').catch(() => ({ data: { data: { modules: [] } } })),
      api.get('/public/plans').catch(() => ({ data: { data: { plans: [] } } })),
    ]).then(([mr, pr]) => {
      const mods  = mr.data.data?.modules || []
      const plns  = pr.data.data?.plans   || []

      setModules(mods.map((m, i) => ({
        id:      m.id,
        name:    m.name,
        blurb:   m.short_description || '',
        credits: m.credit_cost,
        slug:    m.slug,
        cat:     m.category || '',
        tint:    TINT_KEYS[i % TINT_KEYS.length],
        mono:    monoOf(m.name),
      })))

      setPlans(plns.map(p => ({
        id:           p.id,
        managedId:    p.id,
        name:         p.name,
        tagline:      p.tagline || '',
        description:  p.description || '',
        badge_label:  p.badge_label || '',
        price:        p.price_cents / 100,
        priceCents:   p.price_cents,
        credits:      (p.plan_modules || []).length > 0
          ? (p.plan_modules || []).reduce((s, pm) => s + (pm.credits_included || 0), 0)
          : (p.credits_per_module || 0),
        whats_included: Array.isArray(p.whats_included) ? p.whats_included : [],
        isRecommended: p.is_recommended,
        popular:      p.is_recommended,
        includes:     (() => { const n = (p.plan_modules || []).length; return n ? `${n} module${n !== 1 ? 's' : ''}` : '' })(),
        modules:      (p.plan_modules || []).map(pm => pm.module?.name).filter(Boolean),
        moduleObjects: (p.plan_modules || []).map(pm => pm.module).filter(Boolean),
      })))
    }).catch(() => {})
  }, [])

  const handleModuleClick = m => {
    if (m.slug) navigate(`/modules/${m.slug}`)
    else navigate('/courses')
  }

  const handleBuy = plan => {
    if (plan.managedId) navigate(`/plans/${plan.managedId}`)
    else navigate(`/plans/${plan.id}`)
  }

  return (
    <div style={{ background: 'var(--bg)' }}>
      <LandingNavbar onScrollTo={onScrollTo} />
      <Hero onScrollTo={onScrollTo} />
      <Features />
      <ModulesSection modules={modules} onModuleClick={handleModuleClick} />
      <PlansSection plans={plans} onBuy={handleBuy} />
      <ReviewsSection />
      <FAQSection faqs={faqs} />
      <ContactCTA />
      <Footer />
    </div>
  )
}
