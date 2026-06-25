// Server-side timezone helpers — no external deps, uses the Intl API.
// Session start/end times are stored as "HH:MM" wall-clock in the TUTOR's
// timezone, so any comparison against "now" must convert through the tutor's tz.

// UTC offset (minutes) for `tz` at a given UTC timestamp. e.g. IST → +330, EST → -300.
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

// Convert "HH:MM" on dateStr (YYYY-MM-DD) in `tz` → UTC milliseconds.
export function localToUTC(dateStr, timeStr, tz) {
  const [year, mo, day] = String(dateStr).slice(0, 10).split('-').map(Number)
  const [h, m] = String(timeStr).split(':').map(Number)
  const approx = Date.UTC(year, mo - 1, day, h, m, 0)
  // Two-pass offset so DST-transition hours resolve to the correct side: the
  // first sample can land on the wrong side of the jump, so refine it.
  const o1 = tzOffsetAt(tz, approx)
  const o2 = tzOffsetAt(tz, approx - o1 * 60000)
  return approx - o2 * 60000
}

// Returns a Date for the wall-clock (dateStr, timeStr) interpreted in `tz`.
// Falls back to treating the input as UTC if no tz is supplied.
export function localToDate(dateStr, timeStr, tz) {
  if (!tz) return new Date(`${String(dateStr).slice(0, 10)}T${timeStr}:00.000Z`)
  return new Date(localToUTC(dateStr, timeStr, tz))
}

// Which calendar date (YYYY-MM-DD) is `utcMs` in `tz`? Defaults to UTC.
export function dateStrInTz(utcMs, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(utcMs))
}
