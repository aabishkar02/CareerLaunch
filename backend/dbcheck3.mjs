import { PrismaClient } from './node_modules/@prisma/client/default.js'
import { PrismaPg } from './node_modules/@prisma/adapter-pg/dist/index.mjs'
import pg from './node_modules/pg/lib/index.js'
const pool = new pg.Pool({ user:'postgres', host:'127.0.0.1', database:'career_launch', password:'10461', port:5432 })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

// Check distinct roles
const roles = await prisma.$queryRaw`SELECT DISTINCT role, COUNT(*)::int AS n FROM users GROUP BY role`
console.log('roles in users table:', JSON.stringify(roles))

// Check unique constraints on module_tutors
const uq = await prisma.$queryRaw`
  SELECT indexname, indexdef FROM pg_indexes
  WHERE tablename = 'module_tutors'
`
console.log('indexes on module_tutors:', JSON.stringify(uq, null, 2))

await prisma.$disconnect()
pool.end()
