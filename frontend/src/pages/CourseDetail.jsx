import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import usePageTitle from '../utils/usePageTitle'
import { Star, CheckCircle } from 'lucide-react'

function Stars({ rating, size = 13 }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:2 }}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={size} fill={i <= Math.round(rating||0) ? 'var(--credit)' : 'none'} color={i <= Math.round(rating||0) ? 'var(--credit)' : 'var(--border2)'} strokeWidth={1.5} />
      ))}
      <span style={{ fontSize:size-2, color:'var(--text2)', marginLeft:4 }}>{Number(rating||0).toFixed(1)}</span>
    </span>
  )
}

export default function CourseDetail() {
  const { slug }  = useParams()
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const [course, setCourse]         = useState(null)
  const [loading, setLoading]       = useState(true)
  const [enrolled, setEnrolled]     = useState(false)
  const [enrollment, setEnrollment] = useState(null)

  usePageTitle(course?.title || 'Course')

  useEffect(() => {
    api.get(`/courses/${slug}`)
      .then(r => setCourse(r.data.data?.course||null))
      .catch(() => setCourse(null))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!user || !course) return
    api.get('/students/me/enrollments')
      .then(r => {
        const en = (r.data.data?.enrollments||[]).find(e => e.course?.id===course.id || e.course_id===course.id)
        if (en) { setEnrolled(true); setEnrollment(en) }
      })
      .catch(() => {})
  }, [user, course])

  const handleEnroll = (plan) => {
    if (!user) {
      navigate('/register', { state: { redirect: '/checkout', coursePlan: { course, plan } } })
      return
    }
    navigate('/checkout', { state: { coursePlan: { course, plan } } })
  }

  if (loading) return (
    <div className="page">
      <Navbar />
      <div style={{ display:'flex', justifyContent:'center', padding:80 }}><span className="spinner" role="status" aria-label="Loading" /></div>
    </div>
  )

  if (!course) return (
    <div className="page">
      <Navbar />
      <div style={{ textAlign:'center', padding:80 }}>
        <div style={{ fontSize:13, color:'var(--text3)' }}>Course not found.</div>
        <button className="btn btn-outline btn-sm" style={{ marginTop:16 }} onClick={() => navigate('/courses')}>← Back to Courses</button>
      </div>
    </div>
  )

  const plans    = course.pricing_plans || []
  const modules  = course.modules       || []
  const tutors   = (course.course_tutors || []).map(ct => ct.tutor)
  const minPrice = plans.length ? Math.min(...plans.map(p => p.price_cents)) / 100 : null

  return (
    <div className="page">
      <Navbar />

      {/* Hero */}
      <section style={{ borderBottom:'1px solid var(--border)', padding:'48px 24px 40px' }}>
        <div className="container">
          <button className="btn btn-outline btn-sm" style={{ marginBottom:20 }} onClick={() => navigate('/courses')}>← All Courses</button>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:40, alignItems:'start', flexWrap:'wrap' }}>
            <div>
              {course.category && (
                <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', letterSpacing:'0.1em', textTransform:'uppercase', background:'var(--bg3)', border:'1px solid var(--border)', padding:'3px 10px', borderRadius:'var(--radius)', display:'inline-block', marginBottom:12 }}>
                  {course.category}
                </span>
              )}
              <h1 style={{ fontFamily:'var(--font-mono)', fontSize:'clamp(22px,3.5vw,38px)', fontWeight:500, lineHeight:1.2, marginBottom:14, color:'var(--text)' }}>
                {course.title}
              </h1>
              <p style={{ fontSize:15, color:'var(--text2)', lineHeight:1.7, maxWidth:600, marginBottom:20 }}>
                {course.description}
              </p>
              <div style={{ display:'flex', gap:20, fontSize:13, color:'var(--text2)' }}>
                <span><strong style={{ color:'var(--text)' }}>{course._count?.enrollments||0}</strong> students enrolled</span>
                <span><strong style={{ color:'var(--text)' }}>{tutors.length}</strong> expert tutor{tutors.length!==1?'s':''}</span>
                <span><strong style={{ color:'var(--text)' }}>{modules.length}</strong> module{modules.length!==1?'s':''}</span>
              </div>
            </div>

            {/* Sticky pricing card */}
            <div className="card" style={{ minWidth:280, maxWidth:320 }}>
              {enrolled ? (
                <div style={{ textAlign:'center' }}>
                  <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}><CheckCircle size={24} color="var(--success)" strokeWidth={1.5} /></div>
                  <div style={{ fontFamily:'var(--font-mono)', color:'var(--success)', fontSize:14, marginBottom:12 }}>You're enrolled!</div>
                  <button className="btn btn-primary btn-full" onClick={() => navigate('/dashboard/courses')}>
                    Go to Dashboard →
                  </button>
                  {enrollment?.tutor && (
                    <div style={{ marginTop:12, fontSize:12, color:'var(--text2)' }}>
                      Tutor: {enrollment.tutor.first_name} {enrollment.tutor.last_name}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {minPrice !== null && (
                    <div style={{ marginBottom:16 }}>
                      <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--font-mono)', textTransform:'uppercase' }}>Starting from</span>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:28, fontWeight:700, color:'var(--accent)' }}>${minPrice}</div>
                    </div>
                  )}

                  {plans.length === 0 ? (
                    <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12 }}>Contact us for pricing.</div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {plans.map(plan => (
                        <div key={plan.id} className="card" style={{ padding:'14px 16px', background:'var(--bg3)' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                            <div>
                              <div style={{ fontWeight:500, fontSize:13, color:'var(--text)', textTransform:'capitalize' }}>{plan.plan_type} Plan</div>
                              {plan.description && <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>{plan.description}</div>}
                            </div>
                            <div style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--accent)', fontSize:15 }}>
                              ${(plan.price_cents/100).toFixed(0)}
                            </div>
                          </div>
                          <button className="btn btn-primary btn-sm btn-full" onClick={() => handleEnroll(plan)}>
                            {user ? 'Enroll Now' : 'Sign Up & Enroll'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container" style={{ padding:'36px 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:32, alignItems:'start' }}>

          {/* Left: modules */}
          <div>
            {modules.length > 0 && (
              <div style={{ marginBottom:32 }}>
                <h2 style={{ fontFamily:'var(--font-mono)', fontSize:15, fontWeight:500, marginBottom:16, color:'var(--text)' }}>
                  Course Modules
                </h2>
                <div className="card">
                  {modules.map((mod, i) => (
                    <div key={mod.id} style={{ display:'flex', gap:16, padding:'14px 0', borderBottom: i<modules.length-1?'1px solid var(--border)':'none' }}>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', minWidth:32, paddingTop:3 }}>
                        {String(mod.order_index).padStart(2,'0')}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, color:'var(--text)', marginBottom:3 }}>{mod.title}</div>
                        {mod.description && <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6 }}>{mod.description}</div>}
                        {mod.duration_minutes && (
                          <div style={{ fontSize:11, color:'var(--text3)', marginTop:4, fontFamily:'var(--font-mono)' }}>
                            {mod.duration_minutes} min
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: tutors */}
          <div>
            {tutors.length > 0 && (
              <div>
                <h2 style={{ fontFamily:'var(--font-mono)', fontSize:15, fontWeight:500, marginBottom:16, color:'var(--text)' }}>
                  Meet your Tutors
                </h2>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {tutors.map(t => t && (
                    <div key={t.id} className="card">
                      <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                        <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--bg3)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', fontSize:17, color:'var(--accent)', flexShrink:0 }}>
                          {t.first_name?.[0]}{t.last_name?.[0]}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:500, fontSize:14, color:'var(--text)', marginBottom:3 }}>
                            {t.first_name} {t.last_name}
                          </div>
                          {t.tutor_profile && (
                            <div style={{ marginBottom:4 }}>
                              <Stars rating={t.tutor_profile.rating} />
                              <span style={{ fontSize:11, color:'var(--text3)', marginLeft:6 }}>
                                {t.tutor_profile.experience_years}y exp
                              </span>
                            </div>
                          )}
                          {t.bio && (
                            <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, marginTop:4 }}>
                              {t.bio}
                            </div>
                          )}
                          {t.tutor_profile?.specialisations?.length > 0 && (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
                              {t.tutor_profile.specialisations.map(s => (
                                <span key={s} style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', background:'var(--bg3)', border:'1px solid var(--border)', padding:'2px 7px', borderRadius:'var(--radius)' }}>{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
