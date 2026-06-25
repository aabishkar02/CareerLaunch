// Seed the 4 default pricing plans and their module associations.
// Clears ALL plan_modules and plans first (in dependency order), then inserts fresh.
// Run with: node database/seeds/seed_plans.js
// Requires seed_modules.js to have been run first (modules must exist).

import { PrismaClient } from '@prisma/client'
import { PrismaPg }     from '@prisma/adapter-pg'
import pkg              from 'pg'
import dotenv           from 'dotenv'
dotenv.config()

const { Pool } = pkg
const pool   = new Pool({ user:'postgres', host:'127.0.0.1', database:'career_launch', password:'10461', port:5432 })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const PLAN_DEFS = [
  {
    name:           'Single Module',
    tagline:        'Pick any one module and get four 90-minute sessions with a dedicated mentor. Perfect when you have one specific weak spot to fix.',
    price_cents:    14900,
    status:         'active',
    is_recommended: false,
    display_order:  1,
    // No specific modules — student picks on checkout
    modules: [],
  },
  {
    name:           'Interview Ready',
    tagline:        'The full interview gauntlet — behavioral storytelling, technical prep, and presentation skills — with sessions to drill until it\'s muscle memory.',
    price_cents:    54900,
    status:         'active',
    is_recommended: true,
    display_order:  2,
    modules: [
      { slug: 'technical-interview-prep',            credits_included: 4 },
      { slug: 'presentation-skills',                 credits_included: 4 },
      { slug: 'self-assessment-career-exploration',  credits_included: 4 },
    ],
  },
  {
    name:           'Job Seeker Pro',
    tagline:        'Everything that gets you in the door: a resume that lands, a LinkedIn that pulls, outreach that converts, and prep to seal it.',
    price_cents:    69900,
    status:         'active',
    is_recommended: false,
    display_order:  3,
    modules: [
      { slug: 'resume-cv-building',       credits_included: 4 },
      { slug: 'linkedin-profile-building',credits_included: 4 },
      { slug: 'networking-job-search',    credits_included: 4 },
      { slug: 'technical-interview-prep', credits_included: 4 },
    ],
  },
  {
    name:           'Career Accelerator',
    tagline:        'All modules, maximum sessions, and a mentor team that follows you from first draft to signed offer. Our most complete path.',
    price_cents:    129900,
    status:         'active',
    is_recommended: false,
    display_order:  4,
    modules: [
      { slug: 'self-assessment-career-exploration',  credits_included: 4 },
      { slug: 'resume-cv-building',                  credits_included: 4 },
      { slug: 'linkedin-profile-building',           credits_included: 4 },
      { slug: 'github-portfolio-building',           credits_included: 4 },
      { slug: 'presentation-skills',                 credits_included: 4 },
      { slug: 'technical-interview-prep',            credits_included: 4 },
      { slug: 'networking-job-search',               credits_included: 4 },
      { slug: 'personal-branding-online-presence',   credits_included: 4 },
    ],
  },
]

async function seed() {
  console.log('🗑  Clearing existing plan data...\n')

  // 1. Delete plan_modules first — Plan→PlanModule is Cascade but Module→PlanModule is Restrict,
  //    so we must remove these before we can later delete modules (if needed).
  const pmDel = await prisma.planModule.deleteMany({})
  console.log(`  ✗ Deleted ${pmDel.count} plan_modules`)

  // 2. Null out payment.managed_plan_id before deleting plans to avoid FK violations
  const pmtUpd = await prisma.payment.updateMany({
    where: { managed_plan_id: { not: null } },
    data:  { managed_plan_id: null },
  })
  console.log(`  ✗ Cleared managed_plan_id on ${pmtUpd.count} payments`)

  // 3. Delete all plans
  const planDel = await prisma.plan.deleteMany({})
  console.log(`  ✗ Deleted ${planDel.count} plans\n`)

  // Load freshly seeded modules by slug
  const allModules = await prisma.module.findMany({ select: { id: true, slug: true, name: true } })
  const modBySlug  = Object.fromEntries(allModules.map(m => [m.slug, m]))

  if (allModules.length === 0) {
    console.error('❌ No modules found in DB. Run seed_modules.js first.')
    process.exit(1)
  }

  console.log('🌱 Seeding plans...\n')

  for (const def of PLAN_DEFS) {
    const planModulesData = def.modules
      .map((entry, i) => {
        const mod = modBySlug[entry.slug]
        if (!mod) {
          console.warn(`  ⚠  Module not found for slug "${entry.slug}" — skipping`)
          return null
        }
        return {
          module_id:        mod.id,
          credits_included: entry.credits_included,
          display_order:    i,
        }
      })
      .filter(Boolean)

    await prisma.plan.create({
      data: {
        name:           def.name,
        tagline:        def.tagline,
        price_cents:    def.price_cents,
        currency:       'usd',
        billing_type:   'one_time',
        status:         def.status,
        is_recommended: def.is_recommended,
        display_order:  def.display_order,
        plan_modules:   { create: planModulesData },
      },
    })
    console.log(`  ✓ Created: ${def.name} (${planModulesData.length} modules)`)
  }

  const total = await prisma.plan.count()
  console.log(`\n✅ Done — ${total} plans seeded.\n`)
}

seed()
  .catch(e => { console.error('❌ Failed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
