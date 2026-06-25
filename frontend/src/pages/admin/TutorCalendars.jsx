// src/pages/admin/TutorCalendars.jsx
import { useState, useEffect } from 'react'
import api from '../../services/api'
import { X } from 'lucide-react'

// Inline week calendar (view-only) for admin
const HOURS      = Array.from({length:13}, (_,i) => i+8)
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getMonday(d) { const date=new Date(d); const day=date.getDay(); date.setDate(date.getDate()+(day===0?-6:1-day)); date.setHours(0,0,0,0); return date }
function addDays(d,n) { const x=new Date(d); x.setDate(x.getDate()+n); return x }
function fmtDate(d) { const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}` }
function toMins(t) { const [h,m]=t.split(':').map(Number); return h*60+m }
function isToday(d) { return fmtDate(d)===fmtDate(new Date()) }
function isPast(d) { return d < new Date(new Date().setHours(0,0,0,0)) }

function AdminWeekView({ tutorId }) {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [calData, setCal]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [selectedEvent, setSelectedEvent] = useState(null)

  const month = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,'0')}`
  const weekDates = Array.from({length:7}, (_,i) => addDays(weekStart,i))

  useEffect(() => {
    if (!tutorId) return
    setLoading(true)
    api.get(`/admin/tutors/${tutorId}/calendar?month=${month}`)
      .then(r => setCal(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [tutorId, month])

  const eventMap = {}
  weekDates.forEach(date => {
    const key     = fmtDate(date)
    const dayName = date.toLocaleDateString('en-US', { weekday:'long' })
    eventMap[key] = []
    ;(calData?.availability||[]).forEach(a => { if(a.day_of_week===dayName) eventMap[key].push({ type:'avail', start:a.start_time, end:a.end_time, label:'Available', bg:'#f0fdf4', border:'#86efac', text:'#15803d', z:1 }) })
    ;(calData?.busy_slots||[]).forEach(b => { if(String(b.date).slice(0,10)===key) eventMap[key].push({ type:'busy', start:b.start_time, end:b.end_time, label:b.reason||'Busy', bg:'#fef2f2', border:'#fca5a5', text:'#b91c1c', z:2 }) })
    ;(calData?.sessions||[]).forEach(s => {
      if(String(s.scheduled_date).slice(0,10)===key) {
        const ok=s.status==='confirmed', done=s.status==='completed'
        eventMap[key].push({ type:'session', start:s.start_time, end:s.end_time, label:s.subject||'Session', sublabel:s.student?`${s.student.first_name} ${s.student.last_name}`:'', bg:done?'#f8fafc':ok?'#eff6ff':'#fffbeb', border:done?'#cbd5e1':ok?'#93c5fd':'#fcd34d', text:done?'#64748b':ok?'#1d4ed8':'#92400e', z:3, session:s })
      }
    })
  })

  const getCellStatus = (dateKey, hour) => {
    const dayName = new Date(dateKey+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'})
    const mins = hour*60
    const inAvail  = (calData?.availability||[]).some(a=>a.day_of_week===dayName&&toMins(a.start_time)<=mins&&toMins(a.end_time)>mins)
    const inBusy   = (calData?.busy_slots||[]).some(b=>String(b.date).slice(0,10)===dateKey&&toMins(b.start_time)<=mins&&toMins(b.end_time)>mins)
    const inBooked = (calData?.sessions||[]).some(s=>String(s.scheduled_date).slice(0,10)===dateKey&&toMins(s.start_time)<=mins&&toMins(s.end_time)>mins)
    if(inBooked) return 'booked'
    if(inBusy)   return 'busy'
    if(inAvail)  return 'avail'
    return 'off'
  }

  const getPos = (start,end) => {
    const s=toMins(start)-8*60, e=toMins(end)-8*60, total=12*60
    return { top:`${(s/total)*100}%`, height:`${Math.max(((e-s)/total)*100,1.5)}%` }
  }

  const nowMins = new Date().getHours()*60+new Date().getMinutes()-8*60
  const nowPct  = `${(nowMins/(12*60))*100}%`
  const isThisWeek = weekDates.some(d=>isToday(d))

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:14, color:'var(--text)' }}>{MONTHS[weekStart.getMonth()]} {weekStart.getFullYear()}</span>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>setWeekStart(getMonday(new Date()))} style={{ padding:'5px 12px', borderRadius:4, border:'1px solid var(--border2)', background:'var(--bg3)', color:'var(--text2)', cursor:'pointer', fontSize:11 }}>Today</button>
          <button onClick={()=>setWeekStart(d=>addDays(d,-7))} style={{ width:28, height:28, borderRadius:4, border:'1px solid var(--border2)', background:'var(--bg3)', color:'var(--text2)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
          <button onClick={()=>setWeekStart(d=>addDays(d,7))}  style={{ width:28, height:28, borderRadius:4, border:'1px solid var(--border2)', background:'var(--bg3)', color:'var(--text2)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:4, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'44px repeat(7,1fr)', borderBottom:'1px solid var(--border)', background:'var(--bg)' }}>
          <div style={{ borderRight:'1px solid var(--border)' }} />
          {weekDates.map((date,i) => (
            <div key={i} style={{ padding:'8px 4px', textAlign:'center', borderRight:i<6?'1px solid var(--border)':'none', background:isToday(date)?'var(--primary-light)':'transparent' }}>
              <div style={{ fontSize:9, color:'var(--text3)', fontFamily:'var(--font-mono)', textTransform:'uppercase', marginBottom:3 }}>{DAYS_SHORT[i]}</div>
              <div style={{ width:26, height:26, borderRadius:'50%', background:isToday(date)?'var(--primary)':'transparent', color:isToday(date)?'#fff':isPast(date)?'var(--text3)':'var(--text)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto', fontSize:13 }}>
                {date.getDate()}
              </div>
            </div>
          ))}
        </div>

        <div style={{ overflowY:'auto', maxHeight:'60vh', position:'relative' }}>
          {loading && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.3)', zIndex:20 }}>
              <span className="spinner" />
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'44px repeat(7,1fr)', position:'relative' }}>
            <div>
              {HOURS.map(h => (
                <div key={h} style={{ height:56, borderBottom:'1px solid var(--border)', borderRight:'1px solid var(--border)', display:'flex', alignItems:'flex-start', justifyContent:'flex-end', padding:'3px 6px 0 0' }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text3)' }}>{h===12?'12pm':h>12?`${h-12}pm`:`${h}am`}</span>
                </div>
              ))}
            </div>
            {weekDates.map((date,di) => {
              const dateKey = fmtDate(date)
              const events  = eventMap[dateKey]||[]
              return (
                <div key={di} style={{ position:'relative', borderRight:di<6?'1px solid var(--border)':'none' }}>
                  {HOURS.map(h => {
                    const status = getCellStatus(dateKey, h)
                    return (
                      <div key={h} style={{
                        height:56, borderBottom:'1px solid var(--border)',
                        background: status==='avail'?'#f0fdf4':status==='booked'?'#eff6ff':status==='busy'?'#fef2f2':isPast(date)?'var(--bg3)':'transparent',
                      }} />
                    )
                  })}
                  <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
                    {events.map((ev,ei) => {
                      const { top, height } = getPos(ev.start, ev.end)
                      return (
                        <div key={ei} onClick={() => ev.type==='session' && setSelectedEvent(ev.session)} style={{ position:'absolute', left:2, right:2, top, height, background:ev.bg, border:`1px solid ${ev.border}`, borderLeft:`3px solid ${ev.border}`, borderRadius:3, padding:'2px 5px', overflow:'hidden', pointerEvents: ev.type==='session'?'auto':'none', cursor: ev.type==='session'?'pointer':'default', zIndex:ev.z }}>
                          <div style={{ fontSize:10, fontWeight:500, color:ev.text, lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ev.label}</div>
                          {ev.sublabel && <div style={{ fontSize:9, color:ev.text, opacity:0.75, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ev.sublabel}</div>}
                          <div style={{ fontSize:9, color:ev.text, opacity:0.6 }}>{ev.start}–{ev.end}</div>
                        </div>
                      )
                    })}
                  </div>
                  {isToday(date) && isThisWeek && nowMins>=0 && nowMins<=12*60 && (
                    <div style={{ position:'absolute', left:0, right:0, top:nowPct, height:2, background:'var(--accent)', zIndex:10, pointerEvents:'none' }}>
                      <div style={{ position:'absolute', left:-3, top:-4, width:8, height:8, borderRadius:'50%', background:'var(--accent)' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Session detail popup */}
      {selectedEvent && (
        <div style={{ marginTop:12, background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:4, padding:'16px 20px', position:'relative' }}>
          <button onClick={() => setSelectedEvent(null)} style={{ position:'absolute', top:10, right:14, background:'none', border:'none', color:'var(--text3)', cursor:'pointer', display:'flex' }}><X size={16} /></button>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text)', marginBottom:10 }}>{selectedEvent.subject}</div>
          <div style={{ display:'flex', gap:24, fontSize:12, flexWrap:'wrap' }}>
            <div><span style={{ color:'var(--text3)' }}>Student: </span><span style={{ color:'var(--text2)' }}>{selectedEvent.student?.first_name} {selectedEvent.student?.last_name}</span></div>
            <div><span style={{ color:'var(--text3)' }}>Date: </span><span style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(selectedEvent.scheduled_date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</span></div>
            <div><span style={{ color:'var(--text3)' }}>Time: </span><span style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{selectedEvent.start_time}–{selectedEvent.end_time}</span></div>
            <div><span style={{ color:'var(--text3)' }}>Status: </span><span className={`badge badge-${selectedEvent.status==='confirmed'?'green':selectedEvent.status==='completed'?'blue':selectedEvent.status==='cancelled'?'red':'yellow'}`}>{selectedEvent.status}</span></div>
            {selectedEvent.meeting_link && <div><a href={selectedEvent.meeting_link} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:'var(--accent)' }}>Join Meeting ↗</a></div>}
          </div>
          {selectedEvent.notes && <div style={{ marginTop:8, fontSize:12, color:'var(--text2)', background:'var(--bg3)', padding:'6px 10px', borderRadius:4 }}>"{selectedEvent.notes}"</div>}
        </div>
      )}
    </div>
  )
}

export default function TutorCalendars() {
  const [tutors, setTutors]   = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/users?role=tutor')
      .then(r => { const list = r.data.data?.users||[]; setTutors(list); if(list.length>0) setSelected(list[0]) })
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:48 }}><span className="spinner" role="status" aria-label="Loading" /></div>

  return (
    <div>
      <div className="dash-header">
        <div className="dash-title">Tutor Calendars</div>
        <div className="dash-subtitle">View any tutor's week — sessions, availability, and busy slots. Click a session to see details.</div>
      </div>

      {tutors.length === 0 ? (
        <div className="empty-state">No tutors registered yet.</div>
      ) : (
        <>
          {/* Tutor selector */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
            {tutors.map(t => (
              <button key={t.id} onClick={() => setSelected(t)}
                style={{ padding:'8px 16px', borderRadius:4, border:`1px solid ${selected?.id===t.id?'var(--accent)':'var(--border2)'}`, background:selected?.id===t.id?'var(--accent-dim)':'var(--bg3)', color:selected?.id===t.id?'var(--accent)':'var(--text2)', cursor:'pointer', fontSize:12, fontFamily:'var(--font-mono)', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:24, height:24, borderRadius:'50%', background:selected?.id===t.id?'var(--primary-light)':'var(--bg2)', border:'1px solid var(--border)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'var(--primary)' }}>
                  {t.first_name?.[0]}{t.last_name?.[0]}
                </span>
                {t.first_name} {t.last_name}
                <span className={`badge badge-${t.suspended?'red':'green'}`} style={{ fontSize:9 }}>{t.suspended?'Suspended':'Active'}</span>
              </button>
            ))}
          </div>

          {selected && (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:4, marginBottom:16 }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--bg3)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', color:'var(--accent)', flexShrink:0 }}>
                  {selected.first_name?.[0]}{selected.last_name?.[0]}
                </div>
                <div>
                  <div style={{ fontWeight:500, fontSize:14, color:'var(--text)' }}>{selected.first_name} {selected.last_name}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>{selected.email}</div>
                </div>
                <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>
                    <span style={{ color:'rgba(29,158,117,0.8)' }}>■</span> Available &nbsp;
                    <span style={{ color:'#93c5fd' }}>■</span> Session &nbsp;
                    <span style={{ color:'rgba(255,100,60,0.8)' }}>■</span> Busy &nbsp;
                  </div>
                </div>
              </div>
              <AdminWeekView tutorId={selected.id} />
            </>
          )}
        </>
      )}
    </div>
  )
}
