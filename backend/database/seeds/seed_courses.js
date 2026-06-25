// database/seeds/seed_courses.js
// Run with: node database/seeds/seed_courses.js

import { PrismaClient } from '@prisma/client'
import { PrismaPg }     from '@prisma/adapter-pg'
import pkg              from 'pg'
import dotenv           from 'dotenv'
dotenv.config()

const { Pool } = pkg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

// 1. Clean existing data (safe for dev)
// 1. Clean in correct FK order
console.log('  Cleaning existing course data...')
await prisma.enrollment.deleteMany()
await prisma.payment.deleteMany()
await prisma.studentProgress.deleteMany()
await prisma.assignmentSubmission.deleteMany()
await prisma.assignmentStudent.deleteMany()
await prisma.assignmentFile.deleteMany()
await prisma.assignment.deleteMany()
await prisma.pricingPlan.deleteMany()
await prisma.courseModule.deleteMany()
await prisma.course.deleteMany()
console.log('  ✓ Cleaned\n')
// ─── Module definitions ───────────────────────────────────────
const MODULES = [
  {
    order_index:      1,
    title:            'Self-Assessment & Career Exploration',
    description:      'Discover your strengths, explore diverse career paths, and set clear, actionable goals.',
    duration_minutes: 90,
    published:        true,
  },
  {
    order_index:      2,
    title:            'Resume & CV Building',
    description:      'Design a professional, tailored resume or CV that highlights your impact and potential.',
    duration_minutes: 75,
    published:        true,
  },
  {
    order_index:      3,
    title:            'LinkedIn Profile Building',
    description:      'Create a standout LinkedIn profile that reflects your personal brand and attracts opportunities.',
    duration_minutes: 80,
    published:        true,
  },
  {
    order_index:      4,
    title:            'Github Portfolio Building',
    description:      'Build a strong portfolio to showcase your work, code, and projects. Optional for non-CS.',
    duration_minutes: 60,
    published:        true,
  },
  {
    order_index:      5,
    title:            'Presentation Skills',
    description:      'Learn to speak clearly, present ideas effectively, and engage diverse audiences.',
    duration_minutes: 70,
    published:        true,
  },
  {
    order_index:      6,
    title:            'Technical Interview Prep',
    description:      'Master both technical and behavioral interview skills to communicate your story with confidence.',
    duration_minutes: 120,
    published:        true,
  },
  {
    order_index:      7,
    title:            'Networking & Job Search',
    description:      'Develop the skills to connect meaningfully, explore opportunities, and navigate your job search.',
    duration_minutes: 75,
    published:        true,
  },
  {
    order_index:      8,
    title:            'Personal Branding & Online Presence',
    description:      'Build your personal brand, craft your story, and project confidence in every professional setting.',
    duration_minutes: 65,
    published:        true,
  },
]

// ─── Course + plan definitions ────────────────────────────────
const COURSES = [
  {
    title:       'Single Module',
    slug:        'single-module',
    description: 'Choose any one module and go deep on your biggest career gap. Perfect for targeted skill building.',
    category:    'career',
    featured:    false,
    published:   true,
    plan_type:   'single',
    price_cents: 4900,
    modules:     [], // no modules pre-assigned — student picks one
  },
  {
    title:       'Career Starter Bundle',
    slug:        'career-starter-bundle',
    description: 'Modules 1–4. Build the foundation: resume, LinkedIn, GitHub portfolio, and personal brand. Everything you need to get noticed.',
    category:    'career',
    featured:    true,
    published:   true,
    plan_type:   'starter',
    price_cents: 14900,
    modules:     [1, 2, 3, 4], // order_index references
  },
  {
    title:       'Professional Growth Bundle',
    slug:        'professional-growth-bundle',
    description: 'Modules 5–8. Master the job hunt: search strategy, technical interviews, behavioural interviews, and offer negotiation.',
    category:    'career',
    featured:    true,
    published:   true,
    plan_type:   'professional',
    price_cents: 14900,
    modules:     [5, 6, 7, 8],
  },
  {
    title:       'Complete Career Launch',
    slug:        'complete-career-launch',
    description: 'All 8 modules. Full end-to-end career transformation from resume to signed offer. The complete package.',
    category:    'career',
    featured:    true,
    published:   true,
    plan_type:   'complete',
    price_cents: 24900,
    modules:     [1, 2, 3, 4, 5, 6, 7, 8],
  },
]

// ─── Seed function ────────────────────────────────────────────
async function seed() {
  console.log('🌱 Starting seed...\n')

  // 1. Clean existing data (safe for dev)
  console.log('  Cleaning existing course data...')
  await prisma.pricingPlan.deleteMany()
  await prisma.courseModule.deleteMany()
  await prisma.course.deleteMany()
  console.log('  ✓ Cleaned\n')

  // 2. Create all 4 courses with their modules and pricing plans
  for (const courseData of COURSES) {
    const { modules: moduleIndexes, plan_type, price_cents, ...courseFields } = courseData

    console.log(`  Creating course: ${courseFields.title}`)

    // Create course
    const course = await prisma.course.create({
      data: courseFields,
    })

    // Create modules for this course
    if (moduleIndexes.length > 0) {
      const moduleData = MODULES.filter(m => moduleIndexes.includes(m.order_index))
      for (const mod of moduleData) {
        await prisma.courseModule.create({
          data: { ...mod, course_id: course.id },
        })
      }
      console.log(`    ✓ Added ${moduleData.length} modules`)
    } else {
      console.log(`    ✓ No fixed modules (student selects one)`)
    }

    // Create pricing plan
    await prisma.pricingPlan.create({
      data: {
        course_id:   course.id,
        plan_type:   plan_type,
        price_cents: price_cents,
        currency:    'usd',
        active:      true,
        description: courseFields.description,
      },
    })
    console.log(`    ✓ Pricing plan: ${plan_type} @ $${price_cents / 100}`)
    console.log(`    ✓ Course ID: ${course.id}\n`)
  }

  // 3. Print summary
  const courseCount  = await prisma.course.count()
  const moduleCount  = await prisma.courseModule.count()
  const planCount    = await prisma.pricingPlan.count()

  console.log('─────────────────────────────')
  console.log(`✅ Seed complete!`)
  console.log(`   Courses:        ${courseCount}`)
  console.log(`   Modules:        ${moduleCount}`)
  console.log(`   Pricing plans:  ${planCount}`)
  console.log('─────────────────────────────\n')

  // 4. Print course IDs for use in frontend/testing
  const courses = await prisma.course.findMany({
    include: { pricing_plans: true },
    orderBy: { created_at: 'asc' },
  })

  console.log('Course IDs (use these in frontend or Postman):\n')
  for (const c of courses) {
    console.log(`  ${c.title} `)
    console.log(`    courseId: ${c.id}`)
    console.log(`    planId:   ${c.pricing_plans[0]?.id}`)
    console.log(`    planType: ${c.pricing_plans[0]?.plan_type}`)
    console.log(`    price:    $${c.pricing_plans[0]?.price_cents / 100}`)
    console.log()
  }
}

seed()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })