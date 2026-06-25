// One-time backfill for the deduct-at-booking credit model.
//
// Before this change, credits were deducted when a session was completed, so
// pending/confirmed sessions existed without a matching hold on the student's
// balance. After the change, completion no longer deducts — so every in-flight
// module session must have its credit held now, or it will never be charged.
//
// Run once at deploy:  node scripts/backfill-credit-holds.js
// Safe to re-run only if no new old-model sessions exist (it is NOT idempotent —
// each run adds one hold per pending/confirmed module session).

import { prisma } from '../src/config/db.js'

const sessions = await prisma.session.findMany({
  where:  { module_id: { not: null }, status: { in: ['pending', 'confirmed'] } },
  select: { id: true, student_id: true, module_id: true, scheduled_date: true },
})

console.log(`Found ${sessions.length} in-flight module session(s) to hold credits for.`)

let held = 0
let skipped = 0
for (const s of sessions) {
  // Conditional update mirrors the booking hold: never push used past granted.
  const result = await prisma.moduleCredit.updateMany({
    where: {
      student_id:   s.student_id,
      module_id:    s.module_id,
      credits_used: { lt: prisma.moduleCredit.fields.credits_granted },
    },
    data: { credits_used: { increment: 1 } },
  })
  if (result.count > 0) {
    held++
  } else {
    skipped++
    console.warn(`  ! No credit available to hold for session ${s.id} (student ${s.student_id}, module ${s.module_id}) — review manually.`)
  }
}

console.log(`Done. Held ${held} credit(s), ${skipped} session(s) had no available credit.`)
await prisma.$disconnect()
