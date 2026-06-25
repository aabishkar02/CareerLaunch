import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../services/api'
import usePageTitle from '../utils/usePageTitle'
import { Star } from 'lucide-react'

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

export default function Courses() {
  usePageTitle('Courses')
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState([])

  // Build the category list once from the full catalogue, so filtering
  // doesn't shrink the dropdown's own options.
  useEffect(() => {
    api.get('/courses')
      .then(r => {
        const list = r.data.data?.courses || []
        setCategories([...new Set(list.map(c => c.category).filter(Boolean))])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (search)   params.set('search', search)
    if (category) params.set('category', category)

    const timer = setTimeout(() => {
      setLoading(true)
      api.get(`/courses?${params.toString()}`)
        .then(r => setCourses(r.data.data?.courses || []))
        .catch(console.error)
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [search, category])

  const minPrice = (course) => {
    const plans = course.pricing_plans || []
    if (!plans.length) return null
    return Math.min(...plans.map(p => p.price_cents)) / 100
  }

  return (
    <div className="page">
      <Navbar />

      {/* Hero */}
      <section style={{ padding:'52px 24px 40px', borderBottom:'1px solid var(--border)', textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:12 }}>▸ Course Catalogue</div>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(24px,4vw,42px)', fontWeight:700, letterSpacing:'-0.03em', lineHeight:1.15, marginBottom:14 }}>
          Find your <span style={{ color:'var(--accent)' }}>course.</span>
        </h1>
        <p style={{ fontSize:15, color:'var(--text2)', maxWidth:520, margin:'0 auto' }}>
          1-on-1 tutoring with expert instructors. Pick a course, choose your tutor, book sessions at your pace.
        </p>
      </section>

      {/* Filters */}
      <div className="container" style={{ padding:'20px 24px' }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:24 }}>
          <input
            className="form-input"
            style={{ flex:1, minWidth:200, maxWidth:360 }}
            placeholder="Search courses…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="form-select" style={{ width:180 }} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:60 }}><span className="spinner" role="status" aria-label="Loading" /></div>
        ) : courses.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'var(--text3)' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>◦</div>
            <div>No courses found. Try a different search.</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
            {courses.map(course => (
              <Link
                key={course.id}
                to={`/courses/${course.slug}`}
                className="card card-link"
                style={{ transition:'border-color 0.15s' }}
              >
                {course.thumbnail_url && (
                  <div style={{ height:160, overflow:'hidden', borderRadius:'var(--radius)', marginBottom:14, background:'var(--bg3)' }}>
                    <img src={course.thumbnail_url} alt={course.title} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  </div>
                )}

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div>
                    {course.featured && (
                      <span style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}><Star size={10} fill="var(--accent)" color="var(--accent)" /> Featured</span>
                    )}
                    <h3 style={{ fontSize:15, fontWeight:500, color:'var(--text)', lineHeight:1.3 }}>{course.title}</h3>
                  </div>
                </div>

                {course.category && (
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'2px 8px', display:'inline-block', marginBottom:8 }}>
                    {course.category}
                  </span>
                )}

                <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, marginBottom:12, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                  {course.description}
                </p>

                <div style={{ display:'flex', gap:10, marginBottom:12, fontSize:12, color:'var(--text3)' }}>
                  <span>{course._count?.enrollments||0} enrolled</span>
                  <span>·</span>
                  <span>{course.course_tutors?.length||0} tutor{course.course_tutors?.length!==1?'s':''}</span>
                </div>

                {course.course_tutors?.length > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:-6, marginBottom:12 }}>
                    {course.course_tutors.slice(0,4).map((ct, i) => (
                      <div key={ct.tutor?.id||i} title={`${ct.tutor?.first_name} ${ct.tutor?.last_name}`} style={{ width:28, height:28, borderRadius:'50%', background:'var(--bg3)', border:'2px solid var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--accent)', marginLeft: i>0?-8:0, zIndex:4-i, position:'relative' }}>
                        {ct.tutor?.first_name?.[0]}{ct.tutor?.last_name?.[0]}
                      </div>
                    ))}
                    {course.course_tutors.length > 4 && (
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--bg3)', border:'2px solid var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'var(--text2)', marginLeft:-8 }}>
                        +{course.course_tutors.length-4}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'auto', paddingTop:12, borderTop:'1px solid var(--border)' }}>
                  <div>
                    {minPrice(course) !== null ? (
                      <div>
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', textTransform:'uppercase', marginRight:4 }}>from</span>
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:17, fontWeight:700, color:'var(--accent)' }}>${minPrice(course)}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize:12, color:'var(--text3)' }}>Pricing on request</span>
                    )}
                  </div>
                  <span className="btn btn-primary btn-sm">View course</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
