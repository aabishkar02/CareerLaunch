import nodemailer from 'nodemailer'
import { prisma } from '../config/db.js'

// Lazily created so the app starts even if email env vars are missing
let _transporter = null

function getTransporter() {
  if (_transporter) return _transporter

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null // email not configured
  }

  _transporter = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
  })

  return _transporter
}

const FROM = process.env.EMAIL_FROM || '"Career Launch" <noreply@careerlaunch.app>'
const APP_URL = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : 'http://localhost:5173'

// ── Shared branded layout ─────────────────────────────────────
// Swiss-luxury palette: deep navy accent on a warm off-white card. No emojis.
const NAVY = '#1B3A6B'
const INK  = '#1c2024'
const MUTED = '#5b6470'

function layout({ preheader = '', heading, intro, steps = [], cta }) {
  const stepsHtml = steps.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 4px">
        ${steps.map((s, i) => `
          <tr>
            <td style="vertical-align:top;padding:8px 12px 8px 0;width:28px">
              <div style="width:26px;height:26px;border-radius:50%;background:${NAVY};color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:26px">${i + 1}</div>
            </td>
            <td style="vertical-align:top;padding:8px 0">
              <div style="font-size:15px;font-weight:600;color:${INK}">${s.title}</div>
              ${s.body ? `<div style="font-size:14px;color:${MUTED};margin-top:2px;line-height:1.5">${s.body}</div>` : ''}
            </td>
          </tr>`).join('')}
      </table>`
    : ''

  const ctaHtml = cta
    ? `<a href="${cta.href}" style="display:inline-block;margin-top:20px;padding:13px 26px;background:${NAVY};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">${cta.label}</a>`
    : ''

  return `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <div style="background:#f4f1ec;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#fffdf9;border:1px solid #ece6dc;border-radius:16px;overflow:hidden">
      <div style="padding:22px 32px;border-bottom:1px solid #f0ebe2">
        <span style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${INK}">Career<span style="color:${NAVY}">Launch</span></span>
      </div>
      <div style="padding:32px">
        <h1 style="margin:0 0 10px;font-size:22px;letter-spacing:-0.02em;color:${INK}">${heading}</h1>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${MUTED}">${intro}</p>
        ${stepsHtml}
        ${ctaHtml}
      </div>
      <div style="padding:18px 32px;border-top:1px solid #f0ebe2;font-size:12px;color:#9aa1ab">
        You're receiving this because you have a Career Launch account. If this wasn't you, you can ignore this email.
      </div>
    </div>
  </div>`
}

async function send(toEmail, subject, html, text) {
  const transporter = getTransporter()
  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[email] SMTP not configured — skipped "${subject}" to ${toEmail}`)
    }
    return { sent: false, reason: 'not_configured' }
  }
  const info = await transporter.sendMail({ from: FROM, to: toEmail, subject, html, text })
  return { sent: true, messageId: info.messageId }
}

// ── Template cache (5-min TTL) ────────────────────────────────
const _tplCache = new Map() // key → { data, expiresAt }

async function getTemplate(key) {
  const cached = _tplCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.data
  try {
    const tpl = await prisma.emailTemplate.findUnique({ where: { key } })
    if (tpl) {
      _tplCache.set(key, { data: tpl, expiresAt: Date.now() + 5 * 60 * 1000 })
      return tpl
    }
  } catch { /* DB not ready yet — fall through to hardcoded defaults */ }
  return null
}

export const emailService = {
  // ── Password reset ──────────────────────────────────────────
  async sendPasswordReset(toEmail, resetLink) {
    const html = layout({
      preheader: 'Reset your Career Launch password (link expires in 15 minutes).',
      heading: 'Reset your password',
      intro: 'We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong>15 minutes</strong>.',
      cta: { href: resetLink, label: 'Reset password' },
    })
    const text = `Reset your Career Launch password.\n\nOpen this link (expires in 15 minutes):\n${resetLink}\n\nIf you didn't request this, ignore this email.`
    return send(toEmail, 'Reset your Career Launch password', html, text)
  },

  // ── Student welcome (on registration) ───────────────────────
  async sendStudentWelcome(toEmail, firstName) {
    const tpl = await getTemplate('student_welcome')
    const heading  = (tpl?.heading  || 'Welcome, {{firstName}}.').replace('{{firstName}}', firstName)
    const intro    = (tpl?.intro    || "Your account is ready. Career Launch pairs you with a dedicated mentor for focused, one-on-one sessions. Here's how to get going:").replace('{{firstName}}', firstName)
    const steps    = tpl?.steps || [
      { title: 'Browse modules and plans', body: 'Explore the curriculum and pick the plan that matches your goals.' },
      { title: 'Purchase to unlock session credits', body: 'Each credit equals one 70-minute one-on-one session. Credits never expire.' },
      { title: 'Book a session with your mentor', body: "Choose an open slot on your tutor's calendar — times show in your own timezone." },
      { title: 'Join and learn', body: 'Your tutor adds a meeting link once they confirm. Track everything from your dashboard.' },
    ]
    const ctaLabel = tpl?.cta_label || 'Go to your dashboard'
    const subject  = (tpl?.subject  || 'Welcome to Career Launch').replace('{{firstName}}', firstName)
    const preheader = (tpl?.preheader || "Welcome to Career Launch — here's how to get started.").replace('{{firstName}}', firstName)
    const html = layout({ preheader, heading, intro, steps, cta: { href: `${APP_URL}/dashboard`, label: ctaLabel } })
    const text = `Welcome to Career Launch, ${firstName}!\n\n${intro}\n\n${steps.map((s, i) => `${i + 1}. ${s.title}${s.body ? ` — ${s.body}` : ''}`).join('\n')}\n\nDashboard: ${APP_URL}/dashboard`
    return send(toEmail, subject, html, text)
  },

  // ── Tutor welcome (after admin approval) ────────────────────
  async sendTutorWelcome(toEmail, firstName) {
    const tpl = await getTemplate('tutor_welcome')
    const heading  = (tpl?.heading  || "You're approved, {{firstName}}.").replace('{{firstName}}', firstName)
    const intro    = (tpl?.intro    || 'Your tutor account has been approved and you can now start mentoring on Career Launch. A few steps to set yourself up:').replace('{{firstName}}', firstName)
    const steps    = tpl?.steps || [
      { title: 'Complete your tutor profile', body: "Add your bio, expertise, and timezone so students know who they're booking." },
      { title: 'Set your weekly availability', body: "Open the calendar and mark the hours you're available. Students can only book inside these windows." },
      { title: 'Confirm bookings and add meeting links', body: 'When a student requests a session, confirm it and attach your meeting link.' },
      { title: 'Mark sessions complete', body: "Completing a session logs your hours and deducts the student's credit automatically." },
    ]
    const ctaLabel = tpl?.cta_label || 'Go to your tutor dashboard'
    const subject  = (tpl?.subject  || 'Your Career Launch tutor account is approved').replace('{{firstName}}', firstName)
    const preheader = (tpl?.preheader || "Your tutor account is approved — here's how to start mentoring.").replace('{{firstName}}', firstName)
    const html = layout({ preheader, heading, intro, steps, cta: { href: `${APP_URL}/tutor`, label: ctaLabel } })
    const text = `${heading}\n\n${intro}\n\n${steps.map((s, i) => `${i + 1}. ${s.title}${s.body ? ` — ${s.body}` : ''}`).join('\n')}\n\nTutor dashboard: ${APP_URL}/tutor`
    return send(toEmail, subject, html, text)
  },

  // Back-compat generic welcome
  async sendWelcome(toEmail, firstName) {
    return this.sendStudentWelcome(toEmail, firstName)
  },

  // ── Payroll payment processed ────────────────────────────────
  async sendPaymentProcessed(toEmail, { firstName, weekRange, sessions, sessionPay, basePay, totalPay, confirmedBy }) {
    const html = layout({
      preheader: `Your payment of ${totalPay} for the week of ${weekRange} has been processed.`,
      heading: `Payment processed, ${firstName}.`,
      intro: `Your weekly payment has been confirmed. Here is a summary of the breakdown for the week of ${weekRange}.`,
      steps: [
        { title: 'Sessions completed', body: `${sessions} session${sessions !== 1 ? 's' : ''}` },
        { title: 'Session pay',        body: sessionPay },
        { title: 'Weekly base pay',    body: basePay },
        { title: 'Total paid',         body: `<strong>${totalPay}</strong>` },
      ],
      cta: { href: `${APP_URL}/tutor`, label: 'View tutor dashboard' },
    })
    const text = `Payment processed — ${firstName}\n\nWeek: ${weekRange}\nSessions: ${sessions}\nSession Pay: ${sessionPay}\nBase Pay: ${basePay}\nTotal: ${totalPay}\nConfirmed by: ${confirmedBy}\n\nTutor dashboard: ${APP_URL}/tutor`
    return send(toEmail, `Payment processed — ${weekRange}`, html, text)
  },
}
