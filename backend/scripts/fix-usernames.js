import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pkg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pkg
const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT || '5432', 10),
})
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function generateUsername(firstName, lastName, excludeId) {
  const prefix = ((firstName[0] || 'x') + (lastName[0] || 'x')).toLowerCase()
  for (let digits = 4; digits <= 8; digits++) {
    const min = 10 ** (digits - 1)
    const max = 10 ** digits - 1
    for (let attempt = 0; attempt < 50; attempt++) {
      const n         = Math.floor(min + Math.random() * (max - min + 1))
      const candidate = prefix + n
      const taken     = await prisma.user.findFirst({
        where: { username: candidate, id: { not: excludeId } },
      })
      if (!taken) return candidate
    }
  }
  return null
}

async function main() {
  const users = await prisma.user.findMany({
    where:  { username: { not: null } },
    select: { id: true, first_name: true, last_name: true, username: true },
  })

  console.log(`Found ${users.length} users with usernames.`)

  let updated = 0
  for (const u of users) {
    const alreadyGood = /^[a-z]{2}\d{4,}$/.test(u.username)
    if (alreadyGood) {
      console.log(`  SKIP  ${u.username} (already correct format)`)
      continue
    }
    const newUsername = await generateUsername(u.first_name, u.last_name, u.id)
    if (!newUsername) {
      console.log(`  FAIL  ${u.username} — could not generate unique username`)
      continue
    }
    await prisma.user.update({ where: { id: u.id }, data: { username: newUsername } })
    console.log(`  OK    ${u.username} → ${newUsername}`)
    updated++
  }

  console.log(`\nDone. Updated ${updated} of ${users.length} users.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
