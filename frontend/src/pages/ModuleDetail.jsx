import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import api from '../services/api'
import usePageTitle from '../utils/usePageTitle'
import { ArrowLeft, BookOpen, Layers, ChevronRight, CheckCircle } from 'lucide-react'

export default function ModuleDetail() {
  const { slug }  = useParams()
  const navigate  = useNavigate()
  const { user }  = useAuth()

  const [module, setModule]   = useState(null)
  const [plans, setPlans]     = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  usePageTitle(module?.name || 'Module')

  useEffect(() => {
    api.get(`/public/modules/${slug}`)
      .then(r => {
        setModule(r.data.data?.module || null)
        setPlans(r.data.data?.plans || [])
      })
      .catch(err => {
        if (err.response?.status === 404) setNotFound(true)
      })
      .finally(() => setLoading(false))
  }, [slug])

  const handleBuyPlan = (plan) => {
    // Pass the current module as the selected module so checkout knows which module was chosen
    const selectedModule = module ? { id: module.id, title: module.name, slug: module.slug } : null
    navigate(`/plans/${plan.id}`, { state: { managedPlan: plan, selectedModule } })
  }

  if (loading) {
    return (
      <div className="page">
        <Navbar />
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'60vh' }}>
          <span className="spinner" style={{ width:32, height:32 }} />
        </div>
      </div>
    )
  }

  if (notFound || !module) {
    return (
      <div className="page">
        <Navbar />
        <div style={{ maxWidth:640, margin:'120px auto', textAlign:'center', padding:'0 24px' }}>
          <div style={{ fontSize:48, fontFamily:'var(--font-mono)', color:'var(--text3)', marginBottom:16 }}>404</div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Module not found</div>
          <div style={{ fontSize:14, color:'var(--text3)', marginBottom:28 }}>This module may not be published yet.</div>
          <Link to="/" style={{ textDecoration:'none' }}>
            <button className="btn btn-outline">Back to home</button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <Navbar />

      {/* ── Header ── */}
      <section style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)', padding:'56px 24px 48px' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <Link to="/#modules" style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:13, color:'var(--text3)', textDecoration:'none', marginBottom:28, fontWeight:500 }}
            onClick={e => { e.preventDefault(); navigate(-1) }}>
            <ArrowLeft size={14} />
            Back
          </Link>

          <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>
            {module.thumbnail_url ? (
              <img
                src={module.thumbnail_url}
                alt={module.name}
                style={{ width:80, height:80, borderRadius:'var(--radius-md)', objectFit:'cover', border:'1px solid var(--border)', flexShrink:0 }}
              />
            ) : (
              <div style={{ width:80, height:80, borderRadius:'var(--radius-md)', background:'var(--accent-light)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid var(--border)' }}>
                <BookOpen size={32} color="var(--accent)" strokeWidth={1.5} />
              </div>
            )}

            <div style={{ flex:1, minWidth:200 }}>
              {module.category && (
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--accent)', marginBottom:8 }}>
                  {module.category}
                </div>
              )}
              <h1 style={{ fontSize:'clamp(24px,4vw,38px)', fontWeight:900, letterSpacing:'-0.03em', color:'var(--text)', marginBottom:12, lineHeight:1.1 }}>
                {module.name}
              </h1>
              {module.short_description && (
                <p style={{ fontSize:16, color:'var(--text2)', lineHeight:1.7, maxWidth:600, marginBottom:16 }}>
                  {module.short_description}
                </p>
              )}
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'white', border:'1px solid var(--border)', borderRadius:'var(--radius-full)', padding:'6px 16px', fontSize:13, color:'var(--text2)', fontWeight:500 }}>
                <Layers size={13} color="var(--accent)" />
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--accent)' }}>{module.credit_cost}</span>
                {' '}credit{module.credit_cost !== 1 ? 's' : ''} per 90-min session
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section style={{ padding:'60px 24px', background:'white' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr minmax(0,340px)', gap:40, alignItems:'start' }}>

          {/* Left — description */}
          <div>
            {module.full_description ? (
              <>
                <h2 style={{ fontSize:20, fontWeight:800, color:'var(--text)', marginBottom:16, letterSpacing:'-0.02em' }}>About this module</h2>
                <div style={{ fontSize:15, color:'var(--text2)', lineHeight:1.8, whiteSpace:'pre-wrap' }}>
                  {module.full_description}
                </div>
              </>
            ) : (
              <div style={{ color:'var(--text3)', fontSize:14 }}>No detailed description provided yet.</div>
            )}

            {/* Plans that include this module */}
            {plans.length > 0 && (
              <div style={{ marginTop:48 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                  <div style={{ width:3, height:20, background:'var(--accent)', borderRadius:2 }} />
                  <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text)', letterSpacing:'-0.02em', margin:0 }}>
                    Plans that include this module
                  </h2>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {plans.map(plan => (
                    <div
                      key={plan.id}
                      style={{
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        gap:16, padding:'18px 20px',
                        background: plan.is_recommended ? 'var(--accent)' : 'var(--bg2)',
                        border:`1px solid ${plan.is_recommended ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius:'var(--radius-md)',
                        flexWrap:'wrap',
                      }}
                    >
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:15, fontWeight:700, color: plan.is_recommended ? 'white' : 'var(--text)' }}>{plan.name}</span>
                          {plan.is_recommended && (
                            <span style={{ fontSize:10, fontWeight:700, background:'rgba(255,255,255,.25)', color:'white', padding:'2px 8px', borderRadius:'var(--radius-full)' }}>Most Recommended</span>
                          )}
                          {plan.badge_label && (
                            <span style={{ fontSize:10, fontWeight:700, background:'var(--orange)', color:'white', padding:'2px 8px', borderRadius:'var(--radius-full)' }}>{plan.badge_label}</span>
                          )}
                        </div>
                        {plan.tagline && (
                          <div style={{ fontSize:13, color: plan.is_recommended ? 'rgba(255,255,255,.75)' : 'var(--text3)' }}>{plan.tagline}</div>
                        )}
                        <div style={{ fontSize:13, color: plan.is_recommended ? 'rgba(255,255,255,.85)' : 'var(--text3)', marginTop:4 }}>
                          Includes <strong style={{ color: plan.is_recommended ? 'white' : 'var(--text2)' }}>{plan.credits_included} credit{plan.credits_included !== 1 ? 's' : ''}</strong> for this module
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
                        <span style={{ fontSize:22, fontWeight:900, color: plan.is_recommended ? 'white' : 'var(--accent)', letterSpacing:'-1px' }}>
                          ${(plan.price_cents / 100).toFixed(0)}
                        </span>
                        <button
                          className="btn"
                          style={plan.is_recommended ? {
                            background:'white', color:'var(--accent)', fontWeight:700, border:'none', fontSize:14,
                          } : {
                            background:'var(--accent)', color:'white', fontWeight:700, border:'none', fontSize:14,
                          }}
                          onClick={() => handleBuyPlan(plan)}
                        >
                          Get started
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — sticky CTA */}
          <div style={{ position:'sticky', top:24 }}>
            <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius-md)', overflow:'hidden', boxShadow:'var(--shadow-md)' }}>
              <div style={{ background:'var(--accent)', padding:'20px 22px' }}>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.7)', fontWeight:500, marginBottom:4 }}>Included in</div>
                <div style={{ fontSize:22, fontWeight:900, color:'white', lineHeight:1.1 }}>
                  {plans.length} plan{plans.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ padding:'20px 22px', background:'white' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <CheckCircle size={14} color="var(--success)" />
                  <span style={{ fontSize:13, color:'var(--text2)' }}>Expert 1-on-1 tutor sessions</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <CheckCircle size={14} color="var(--success)" />
                  <span style={{ fontSize:13, color:'var(--text2)' }}>{module.credit_cost} credit{module.credit_cost !== 1 ? 's' : ''} per 90-minute session</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:24 }}>
                  <CheckCircle size={14} color="var(--success)" />
                  <span style={{ fontSize:13, color:'var(--text2)' }}>Lifetime module access</span>
                </div>
                {plans.length > 0 ? (
                  <button
                    className="btn btn-primary btn-full"
                    style={{ fontWeight:700, fontSize:14 }}
                    onClick={() => document.getElementById('plans-section')?.scrollIntoView({ behavior:'smooth' }) || navigate('/#plans')}
                  >
                    View plans that include this module
                  </button>
                ) : (
                  <Link to="/#plans" style={{ textDecoration:'none', display:'block' }}>
                    <button className="btn btn-primary btn-full" style={{ fontWeight:700, fontSize:14 }}>Browse all plans</button>
                  </Link>
                )}
                <div style={{ marginTop:12, textAlign:'center' }}>
                  <Link to="/" style={{ fontSize:12, color:'var(--text3)', textDecoration:'none' }}>Back to all modules</Link>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  )
}
