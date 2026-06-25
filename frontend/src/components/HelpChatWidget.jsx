import { toast } from '../services/toast'
import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, Send, ChevronDown, Loader } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { getSocket } from '../services/socket'

// ── Helpers ─────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── HelpChatWidget ───────────────────────────────────────────────
export default function HelpChatWidget() {
  const { user } = useAuth()
  const [open,    setOpen]    = useState(false)
  const [chat,    setChat]    = useState(null)   // null = not loaded yet
  const [loaded,  setLoaded]  = useState(false)
  const [messages, setMessages] = useState([])
  const [subject,  setSubject]  = useState('')
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [starting, setStarting] = useState(false)
  const [adminTyping, setAdminTyping] = useState(false)
  const typingTimer = useRef(null)
  const messagesEnd = useRef(null)
  const socket = useRef(null)

  // Load existing chat on mount
  useEffect(() => {
    api.get('/help-chat/mine')
      .then(r => {
        const c = r.data.data?.chat
        setChat(c || null)
        if (c) setMessages(c.messages || [])
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Connect socket once user is known
  useEffect(() => {
    if (!user) return
    const s = getSocket()
    socket.current = s
    if (!s.connected) s.connect()

    s.on('helpChat:claimed', ({ chatId, admin }) => {
      setChat(prev => prev?.id === chatId ? { ...prev, status: 'active', admin } : prev)
    })

    s.on('helpChat:message', ({ chatId, message }) => {
      setChat(prev => {
        if (!prev || prev.id !== chatId) return prev
        return prev
      })
      setMessages(prev => {
        // Guard against duplicates
        if (prev.some(m => m.id === message.id)) return prev
        return [...prev, message]
      })
    })

    s.on('helpChat:closed', ({ chatId }) => {
      setChat(prev => prev?.id === chatId ? { ...prev, status: 'closed', closed_at: new Date().toISOString() } : prev)
    })

    s.on('helpChat:typing', ({ chatId, isTyping }) => {
      setAdminTyping(isTyping)
      if (isTyping) {
        clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => setAdminTyping(false), 3000)
      }
    })

    return () => {
      s.off('helpChat:claimed')
      s.off('helpChat:message')
      s.off('helpChat:closed')
      s.off('helpChat:typing')
    }
  }, [user])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, adminTyping])

  const startChat = async () => {
    setStarting(true)
    try {
      const r = await api.post('/help-chat', { subject: subject.trim() || undefined })
      const newChat = r.data.data.chat
      setChat(newChat)
      setMessages([])
    } catch (e) {
      const err = e.response?.data?.error || 'Failed to start chat'
      // If duplicate, reload
      if (e.response?.status === 409) {
        const r = await api.get('/help-chat/mine')
        const c = r.data.data?.chat
        setChat(c)
        setMessages(c?.messages || [])
      } else {
        toast.error(err)
      }
    } finally {
      setStarting(false)
    }
  }

  const send = async () => {
    if (!input.trim() || !chat || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)

    // Optimistic
    const optimistic = {
      id: 'opt_' + Date.now(),
      content,
      sent_at: new Date().toISOString(),
      sender: { id: user.id, role: user.role, first_name: user.first_name, last_name: user.last_name },
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const r = await api.post(`/help-chat/${chat.id}/messages`, { content })
      setMessages(prev => prev.map(m => m.id === optimistic.id ? r.data.data.message : m))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const handleInputChange = e => {
    setInput(e.target.value)
    // Typing indicator to admin
    if (chat?.status === 'active' && chat?.admin?.id && socket.current) {
      socket.current.emit('helpChat:typing', { chatId: chat.id, recipientId: chat.admin.id, isTyping: true })
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => {
        socket.current?.emit('helpChat:typing', { chatId: chat.id, recipientId: chat.admin?.id, isTyping: false })
      }, 2000)
    }
  }

  if (!loaded) return null

  const status = chat?.status
  const HIDE_MS = 30 * 60 * 1000
  const hidden = status === 'closed' && chat.closed_at && (Date.now() - new Date(chat.closed_at).getTime()) > HIDE_MS

  if (hidden) return null

  return (
    <>
      {/* ── Floating button ──────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 900,
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(79,70,229,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Get help"
        >
          <MessageCircle size={22} />
          {(status === 'waiting' || status === 'active') && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              width: 12, height: 12, borderRadius: '50%',
              background: status === 'active' ? '#22c55e' : '#f59e0b',
              border: '2px solid #fff',
            }} />
          )}
        </button>
      )}

      {/* ── Chat panel ──────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 900,
          width: 360, maxHeight: 540,
          background: '#fff', borderRadius: 20,
          boxShadow: '0 12px 48px rgba(0,0,0,.18)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp .2s ease',
        }}>
          {/* Header */}
          <div style={{
            background: 'var(--accent)', color: '#fff',
            padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>Support Chat</div>
              <div style={{ fontSize: 12, opacity: .85, marginTop: 1 }}>
                {status === 'waiting' && 'Waiting for an admin...'}
                {status === 'active'  && `Chatting with ${chat.admin?.first_name || 'support'}`}
                {status === 'closed'  && 'Chat ended'}
                {!status              && 'We usually reply in minutes'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#fff', display: 'flex' }}>
                <ChevronDown size={18} />
              </button>
              <button
                onClick={() => { setOpen(false); setChat(null); setMessages([]) }}
                style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#fff', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* ── No chat yet ── */}
            {!status && (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 14, color: 'var(--text2)' }}>
                  Need help? Start a live chat and a member of our team will join shortly.
                </div>
                <input
                  className="input"
                  placeholder="Subject (optional)"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={{ fontSize: 14 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={startChat}
                  disabled={starting}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {starting ? <><Loader size={15} className="spin" /> Starting...</> : 'Start chat'}
                </button>
              </div>
            )}

            {/* ── Waiting ── */}
            {status === 'waiting' && (
              <div style={{ padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
                <span className="spinner" style={{ width: 28, height: 28, borderColor: 'var(--accent)' }} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>Waiting for support</div>
                <div style={{ color: 'var(--text3)', fontSize: 13 }}>An admin will join your chat shortly.</div>
                {chat?.subject && <div style={{ color: 'var(--text2)', fontSize: 13 }}><strong>Subject:</strong> {chat.subject}</div>}
              </div>
            )}

            {/* ── Active or Closed: messages ── */}
            {(status === 'active' || status === 'closed') && (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }} className="scroll">
                  {messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '20px 0' }}>
                      {status === 'active' ? 'Say hello to get started!' : 'No messages in this chat.'}
                    </div>
                  )}
                  {messages.map(m => {
                    const mine = m.sender?.role !== 'admin'
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '78%',
                          background: mine ? 'var(--accent)' : 'var(--bg2)',
                          color: mine ? '#fff' : 'var(--text)',
                          borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          padding: '8px 12px',
                          fontSize: 13.5,
                          lineHeight: 1.45,
                        }}>
                          {!mine && (
                            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3, opacity: .65 }}>
                              {m.sender?.first_name}
                            </div>
                          )}
                          {m.content}
                          <div style={{ fontSize: 10.5, opacity: .55, marginTop: 3, textAlign: 'right' }}>
                            {fmtTime(m.sent_at)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {adminTyping && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div style={{ background: 'var(--bg2)', borderRadius: '16px 16px 16px 4px', padding: '8px 14px', display: 'flex', gap: 4, alignItems: 'center' }}>
                        {[0,1,2].map(i => (
                          <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)', display: 'block', animation: `bounce .9s ${i * .15}s infinite` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  {status === 'closed' && (
                    <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>
                      This chat has ended.
                    </div>
                  )}
                  <div ref={messagesEnd} />
                </div>

                {/* Input */}
                {status === 'active' && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea
                      rows={1}
                      className="input"
                      placeholder="Type a message..."
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKey}
                      style={{ flex: 1, resize: 'none', fontSize: 14, padding: '8px 12px', minHeight: 38, maxHeight: 96 }}
                    />
                    <button
                      onClick={send}
                      disabled={!input.trim() || sending}
                      style={{
                        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                        background: input.trim() ? 'var(--accent)' : 'var(--bg3)',
                        color: input.trim() ? '#fff' : 'var(--text3)',
                        border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Send size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        .spin { animation: spin .7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
