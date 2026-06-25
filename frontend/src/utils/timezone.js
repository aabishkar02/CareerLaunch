// Timezone utilities — no external dependencies, uses Intl API

// ── Core conversion ───────────────────────────────────────────

// Get the UTC offset (minutes) for `tz` at a given UTC timestamp
// e.g. UTC+5:30 → +330, EST → -300
function tzOffsetAt(tz, utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false,
    }).formatToParts(new Date(utcMs)).map(p => [p.type, p.value])
  )
  const mirror = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second
  )
  return (mirror - utcMs) / 60000
}

// Convert "HH:MM" on dateStr in tz → UTC milliseconds
export function localToUTC(dateStr, timeStr, tz) {
  const [year, mo, day] = dateStr.split('-').map(Number)
  const [h, m] = timeStr.split(':').map(Number)
  const approx = Date.UTC(year, mo - 1, day, h, m, 0)
  // Two-pass offset: the first sample can land on the wrong side of a DST
  // transition (e.g. the hour just after spring-forward), so refine it at the
  // corrected instant before applying.
  const o1 = tzOffsetAt(tz, approx) // minutes ahead of UTC
  const o2 = tzOffsetAt(tz, approx - o1 * 60000)
  return approx - o2 * 60000
}

// Convert UTC ms → "HH:MM" in tz
export function utcToHHMM(utcMs, tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(utcMs)).replace(/^24/, '00')
}

// Convert "HH:MM" from fromTz to toTz on a given dateStr
export function convertTime(timeStr, fromTz, toTz, dateStr) {
  if (fromTz === toTz) return timeStr
  return utcToHHMM(localToUTC(dateStr, timeStr, fromTz), toTz)
}

// ── Calendar helpers ──────────────────────────────────────────

// Which date (YYYY-MM-DD) does a UTC timestamp land on in `tz`?
function utcToDateStr(utcMs, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(utcMs))
}

// What "long" weekday name (Monday, Tuesday…) is dateStr in tz?
export function weekdayInTz(dateStr, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'long',
  }).format(new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)))
}

// For a student's calendar date (in studentTz), return the tutor availability windows
// that overlap with that day, expressed as {start, end} in studentTz.
// Handles cross-midnight slots correctly.
export function availabilityForDay(studentDateStr, studentTz, tutorTz, tutorSlots) {
  const dayStart = localToUTC(studentDateStr, '00:00', studentTz)
  const dayEnd   = dayStart + 24 * 60 * 60 * 1000

  // Tutor may be on a different calendar day — check both border dates
  const tutorDates = [...new Set([
    utcToDateStr(dayStart, tutorTz),
    utcToDateStr(dayEnd - 1, tutorTz),
  ])]

  const results = []
  for (const tutorDate of tutorDates) {
    const tutorDay = weekdayInTz(tutorDate, tutorTz)
    for (const slot of tutorSlots.filter(s => s.day_of_week === tutorDay)) {
      const slotStart = localToUTC(tutorDate, slot.start_time, tutorTz)
      const slotEnd   = localToUTC(tutorDate, slot.end_time,   tutorTz)
      const intStart  = Math.max(slotStart, dayStart)
      const intEnd    = Math.min(slotEnd,   dayEnd)
      if (intStart < intEnd) {
        results.push({
          start:    utcToHHMM(intStart, studentTz),
          end:      utcToHHMM(intEnd,   studentTz),
          startUTC: intStart,
          endUTC:   intEnd,
        })
      }
    }
  }
  return results
}

// Convert busy slots and sessions from tutorTz to viewerTz for a given student date
export function convertSlotsToTz(slots, fromTz, toTz, dateField, startField, endField) {
  if (fromTz === toTz) return slots
  return slots.map(s => {
    const dateStr = String(s[dateField]).slice(0, 10)
    return {
      ...s,
      [startField]: convertTime(s[startField], fromTz, toTz, dateStr),
      [endField]:   convertTime(s[endField],   fromTz, toTz, dateStr),
    }
  })
}

// ── Booking reverse-conversion ────────────────────────────────

// Given a slot selected in studentTz (studentDate + startHHMM), return the
// equivalent tutor date + time for the API booking request
export function studentSlotToTutorTime(studentDateStr, startHHMM, endHHMM, studentTz, tutorTz) {
  const startUTC = localToUTC(studentDateStr, startHHMM, studentTz)
  const endUTC   = localToUTC(studentDateStr, endHHMM,   studentTz)
  return {
    scheduled_date: utcToDateStr(startUTC, tutorTz),
    start_time:     utcToHHMM(startUTC, tutorTz),
    end_time:       utcToHHMM(endUTC,   tutorTz),
  }
}

// ── Display formatting ────────────────────────────────────────

// "09:30" → "9:30 AM"
export function fmt12(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// "Asia/Kolkata" → "Asia/Kolkata (UTC+5:30)"
export function tzLabel(tz) {
  try {
    const offsetMins = tzOffsetAt(tz, Date.now())
    const sign = offsetMins >= 0 ? '+' : '-'
    const abs  = Math.abs(offsetMins)
    const h    = Math.floor(abs / 60)
    const m    = abs % 60
    const off  = `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
    return `${tz.replace(/_/g, ' ')} (${off})`
  } catch {
    return tz
  }
}

// Short label for display in banners: "IST (UTC+5:30)"
export function tzShort(tz) {
  try {
    const abbr = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'short',
    }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || tz
    const offsetMins = tzOffsetAt(tz, Date.now())
    const sign = offsetMins >= 0 ? '+' : '-'
    const abs  = Math.abs(offsetMins)
    const h    = Math.floor(abs / 60)
    const m    = abs % 60
    const off  = `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
    return `${abbr} (${off})`
  } catch {
    return tz
  }
}

// ── Browser timezone ──────────────────────────────────────────

export function browserTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
}

// ── Curated timezone list ─────────────────────────────────────

export const COMMON_TIMEZONES = [
  // UTC
  { label: 'UTC',                            value: 'UTC' },
  // Americas
  { label: 'Halifax (AST/ADT)',              value: 'America/Halifax' },
  { label: 'New York / Toronto (EST/EDT)',   value: 'America/New_York' },
  { label: 'Chicago (CST/CDT)',              value: 'America/Chicago' },
  { label: 'Denver (MST/MDT)',               value: 'America/Denver' },
  { label: 'Los Angeles / Vancouver (PST)',  value: 'America/Los_Angeles' },
  { label: 'Anchorage (AKST)',               value: 'America/Anchorage' },
  { label: 'Honolulu (HST)',                 value: 'Pacific/Honolulu' },
  { label: 'São Paulo (BRT)',                value: 'America/Sao_Paulo' },
  { label: 'Buenos Aires (ART)',             value: 'America/Argentina/Buenos_Aires' },
  // Europe
  { label: 'London (GMT/BST)',               value: 'Europe/London' },
  { label: 'Dublin (GMT/IST)',               value: 'Europe/Dublin' },
  { label: 'Paris / Berlin (CET/CEST)',      value: 'Europe/Paris' },
  { label: 'Helsinki / Kyiv (EET/EEST)',     value: 'Europe/Helsinki' },
  { label: 'Istanbul (TRT)',                 value: 'Europe/Istanbul' },
  { label: 'Moscow (MSK)',                   value: 'Europe/Moscow' },
  // Africa / Middle East
  { label: 'Cairo (EET)',                    value: 'Africa/Cairo' },
  { label: 'Nairobi (EAT)',                  value: 'Africa/Nairobi' },
  { label: 'Dubai (GST)',                    value: 'Asia/Dubai' },
  // Asia
  { label: 'Kabul (AFT)',                    value: 'Asia/Kabul' },
  { label: 'Karachi (PKT)',                  value: 'Asia/Karachi' },
  { label: 'Kolkata / Mumbai (IST)',         value: 'Asia/Kolkata' },
  { label: 'Kathmandu (NPT)',               value: 'Asia/Kathmandu' },
  { label: 'Dhaka (BST)',                    value: 'Asia/Dhaka' },
  { label: 'Yangon (MMT)',                   value: 'Asia/Rangoon' },
  { label: 'Bangkok / Jakarta (ICT/WIB)',   value: 'Asia/Bangkok' },
  { label: 'Singapore / KL (SGT/MYT)',      value: 'Asia/Singapore' },
  { label: 'Hong Kong / Perth (HKT/AWST)', value: 'Asia/Hong_Kong' },
  { label: 'Seoul (KST)',                    value: 'Asia/Seoul' },
  { label: 'Tokyo (JST)',                    value: 'Asia/Tokyo' },
  // Pacific / Australia
  { label: 'Darwin (ACST)',                  value: 'Australia/Darwin' },
  { label: 'Adelaide (ACST/ACDT)',           value: 'Australia/Adelaide' },
  { label: 'Sydney / Melbourne (AEST)',      value: 'Australia/Sydney' },
  { label: 'Auckland (NZST/NZDT)',           value: 'Pacific/Auckland' },
]
