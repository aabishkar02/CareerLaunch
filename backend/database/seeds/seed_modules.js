// Seed the managed `modules` table.
// Clears ALL plan_modules, plans, and modules first (in dependency order), then inserts fresh.
// Run with: node database/seeds/seed_modules.js
// After running this, run seed_plans.js to re-seed plans.

import { PrismaClient } from '@prisma/client'
import { PrismaPg }     from '@prisma/adapter-pg'
import pkg              from 'pg'
import dotenv           from 'dotenv'
dotenv.config()

const { Pool } = pkg
const pool   = new Pool({ user:'postgres', host:'127.0.0.1', database:'career_launch', password:'10461', port:5432 })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const MODULES = [
  {
    name:              'Self-Assessment & Career Exploration',
    slug:              'self-assessment-career-exploration',
    short_description: 'Discover your strengths, explore diverse career paths, and set clear, actionable goals.',
    full_description:  'A deep-dive into understanding who you are as a professional. You will map your skills, values, and interests to specific career paths, define short- and long-term goals, and create an action plan with your tutor.',
    credit_cost:       1,
    category:          'Career Foundation',
    display_order:     1,
    status:            'published',
    visibility:        'public',
  },
  {
    name:              'Resume & CV Building',
    slug:              'resume-cv-building',
    short_description: 'Design a professional, tailored resume or CV that highlights your impact and potential.',
    full_description:  'Work 1-on-1 with your tutor to craft a role-targeted resume. Covers structure, achievement-led bullet points, ATS optimisation, and multiple format options (one-page, two-page, academic CV).',
    credit_cost:       1,
    category:          'Career Materials',
    display_order:     2,
    status:            'published',
    visibility:        'public',
  },
  {
    name:              'LinkedIn Profile Building',
    slug:              'linkedin-profile-building',
    short_description: 'Create a standout LinkedIn profile that reflects your personal brand and attracts opportunities.',
    full_description:  'Optimise every section of your LinkedIn profile for recruiter discovery. Covers headline, summary, experience, skills endorsements, and engagement strategy to grow your network.',
    credit_cost:       1,
    category:          'Personal Brand',
    display_order:     3,
    status:            'published',
    visibility:        'public',
  },
  {
    name:              'GitHub Portfolio Building',
    slug:              'github-portfolio-building',
    short_description: 'Build a strong portfolio to showcase your work, code, and projects. Optional for non-CS.',
    full_description:  'Create and curate a GitHub profile that demonstrates real-world skills. Covers README writing, project structure, contribution graphs, and pinned repository selection.',
    credit_cost:       1,
    category:          'Personal Brand',
    display_order:     4,
    status:            'published',
    visibility:        'public',
  },
  {
    name:              'Presentation Skills',
    slug:              'presentation-skills',
    short_description: 'Learn to speak clearly, present ideas effectively, and engage diverse audiences.',
    full_description:  'Live practice sessions covering structure, delivery, slide design, and Q&A handling. Recorded mock presentations with detailed tutor feedback.',
    credit_cost:       1,
    category:          'Communication',
    display_order:     5,
    status:            'published',
    visibility:        'public',
  },
  {
    name:              'Technical Interview Prep',
    slug:              'technical-interview-prep',
    short_description: 'Master both technical and behavioural interview skills to communicate your story with confidence.',
    full_description:  'Full interview simulation with tutor-as-interviewer. Covers STAR method, technical problem-solving, company-specific research, and nerves management strategies.',
    credit_cost:       1,
    category:          'Interview',
    display_order:     6,
    status:            'published',
    visibility:        'public',
  },
  {
    name:              'Networking & Job Search',
    slug:              'networking-job-search',
    short_description: 'Develop the skills to connect meaningfully, explore opportunities, and navigate your job search.',
    full_description:  'Build a systematic job search engine. Covers cold outreach templates, informational interviews, recruiter engagement, job board strategy, and tracking systems.',
    credit_cost:       1,
    category:          'Job Search',
    display_order:     7,
    status:            'published',
    visibility:        'public',
  },
  {
    name:              'Personal Branding & Online Presence',
    slug:              'personal-branding-online-presence',
    short_description: 'Build your personal brand, craft your story, and project confidence in every professional setting.',
    full_description:  'Define and communicate what makes you unique as a candidate. Covers personal mission statement, content strategy, thought leadership, and consistent brand voice across channels.',
    credit_cost:       1,
    category:          'Personal Brand',
    display_order:     8,
    status:            'published',
    visibility:        'public',
  },
]

async function seed() {
  console.log('🗑  Clearing existing data...\n')

  // 1. Delete plan_modules first — references both Module (Restrict) and Plan (Cascade)
  const pmDel = await prisma.planModule.deleteMany({})
  console.log(`  ✗ Deleted ${pmDel.count} plan_modules`)

  // 2. Null out payment.managed_plan_id before deleting plans
  const pmtUpd = await prisma.payment.updateMany({
    where: { managed_plan_id: { not: null } },
    data:  { managed_plan_id: null },
  })
  console.log(`  ✗ Cleared managed_plan_id on ${pmtUpd.count} payments`)

  // 3. Delete all plans
  const planDel = await prisma.plan.deleteMany({})
  console.log(`  ✗ Deleted ${planDel.count} plans`)

  // 4. Delete all managed modules
  const modDel = await prisma.module.deleteMany({})
  console.log(`  ✗ Deleted ${modDel.count} modules\n`)

  console.log('🌱 Seeding modules...\n')

  for (const mod of MODULES) {
    await prisma.module.create({ data: mod })
    console.log(`  ✓ Created: ${mod.name}`)
  }

  const total = await prisma.module.count()
  console.log(`\n✅ Done — ${total} modules seeded. Run seed_plans.js next.\n`)
}

seed()
  .catch(e => { console.error('❌ Failed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
