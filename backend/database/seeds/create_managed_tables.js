// Creates modules, plans, plan_modules tables directly with raw SQL
// then seeds the 8 career modules.

import pkg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pkg
const pool = new Pool({
  user: 'postgres', host: '127.0.0.1', database: 'career_launch',
  password: '10461', port: 5432,
})

const client = await pool.connect()

try {
  await client.query('BEGIN')

  // ── Create modules table ──────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS modules (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name             VARCHAR(200) NOT NULL,
      slug             VARCHAR(200) NOT NULL UNIQUE,
      short_description TEXT,
      full_description  TEXT,
      thumbnail_url    TEXT,
      credit_cost      INTEGER     NOT NULL DEFAULT 1,
      category         VARCHAR(100),
      status           VARCHAR(20)  NOT NULL DEFAULT 'draft',
      visibility       VARCHAR(20)  NOT NULL DEFAULT 'public',
      display_order    INTEGER     NOT NULL DEFAULT 0,
      created_by       UUID,
      created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at       TIMESTAMP(3)
    )
  `)
  console.log('✓ modules table ready')

  // ── Create plans table ────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name            VARCHAR(200) NOT NULL,
      tagline         VARCHAR(300),
      price_cents     INTEGER     NOT NULL DEFAULT 0,
      currency        VARCHAR(3)  NOT NULL DEFAULT 'usd',
      billing_type    VARCHAR(20)  NOT NULL DEFAULT 'one_time',
      whats_included  JSONB       NOT NULL DEFAULT '[]',
      status          VARCHAR(20)  NOT NULL DEFAULT 'draft',
      is_recommended  BOOLEAN     NOT NULL DEFAULT false,
      badge_label     VARCHAR(50),
      display_order   INTEGER     NOT NULL DEFAULT 0,
      stripe_plan_id  VARCHAR(200),
      created_by      UUID,
      created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('✓ plans table ready')

  // ── Create plan_modules join table ────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS plan_modules (
      id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id          UUID    NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      module_id        UUID    NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      credits_included INTEGER NOT NULL DEFAULT 1,
      UNIQUE(plan_id, module_id)
    )
  `)
  console.log('✓ plan_modules table ready')

  // ── Add managed_plan_id to payments if missing ────────────────
  await client.query(`
    ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS managed_plan_id UUID REFERENCES plans(id)
  `)
  console.log('✓ payments.managed_plan_id column ready')

  await client.query('COMMIT')
  console.log('\n✅ Tables created/verified\n')

  // ── Seed the 8 modules ────────────────────────────────────────
  const MODULES = [
    { name:'Self-Assessment & Career Exploration', slug:'self-assessment-career-exploration', short_description:'Discover your strengths, explore diverse career paths, and set clear, actionable goals.', full_description:'A deep-dive into understanding who you are as a professional. You will map your skills, values, and interests to specific career paths, define short- and long-term goals, and create an action plan with your tutor.', credit_cost:1, category:'Career Foundation', display_order:1 },
    { name:'Resume & CV Building', slug:'resume-cv-building', short_description:'Design a professional, tailored resume or CV that highlights your impact and potential.', full_description:'Work 1-on-1 with your tutor to craft a role-targeted resume. Covers structure, achievement-led bullet points, ATS optimisation, and multiple format options.', credit_cost:1, category:'Career Materials', display_order:2 },
    { name:'LinkedIn Profile Building', slug:'linkedin-profile-building', short_description:'Create a standout LinkedIn profile that reflects your personal brand and attracts opportunities.', full_description:'Optimise every section of your LinkedIn profile for recruiter discovery. Covers headline, summary, experience, skills endorsements, and engagement strategy.', credit_cost:1, category:'Personal Brand', display_order:3 },
    { name:'GitHub Portfolio Building', slug:'github-portfolio-building', short_description:'Build a strong portfolio to showcase your work, code, and projects.', full_description:'Create and curate a GitHub profile that demonstrates real-world skills. Covers README writing, project structure, contribution graphs, and pinned repository selection.', credit_cost:1, category:'Personal Brand', display_order:4 },
    { name:'Presentation Skills', slug:'presentation-skills', short_description:'Learn to speak clearly, present ideas effectively, and engage diverse audiences.', full_description:'Live practice sessions covering structure, delivery, slide design, and Q&A handling. Recorded mock presentations with detailed tutor feedback.', credit_cost:1, category:'Communication', display_order:5 },
    { name:'Technical Interview Prep', slug:'technical-interview-prep', short_description:'Master both technical and behavioural interview skills to communicate your story with confidence.', full_description:'Full interview simulation with tutor-as-interviewer. Covers STAR method, technical problem-solving, company-specific research, and nerves management strategies.', credit_cost:1, category:'Interview', display_order:6 },
    { name:'Networking & Job Search', slug:'networking-job-search', short_description:'Develop the skills to connect meaningfully, explore opportunities, and navigate your job search.', full_description:'Build a systematic job search engine. Covers cold outreach templates, informational interviews, recruiter engagement, job board strategy, and tracking systems.', credit_cost:1, category:'Job Search', display_order:7 },
    { name:'Personal Branding & Online Presence', slug:'personal-branding-online-presence', short_description:'Build your personal brand, craft your story, and project confidence in every professional setting.', full_description:'Define and communicate what makes you unique as a candidate. Covers personal mission statement, content strategy, thought leadership, and consistent brand voice across channels.', credit_cost:1, category:'Personal Brand', display_order:8 },
  ]

  let created = 0, updated = 0
  for (const m of MODULES) {
    const existing = await client.query('SELECT id FROM modules WHERE slug = $1', [m.slug])
    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE modules SET name=$1, short_description=$2, full_description=$3, credit_cost=$4,
         category=$5, display_order=$6, status='active', visibility='public', updated_at=NOW()
         WHERE slug=$7`,
        [m.name, m.short_description, m.full_description, m.credit_cost, m.category, m.display_order, m.slug]
      )
      console.log(`  ↻ Updated: ${m.name}`)
      updated++
    } else {
      await client.query(
        `INSERT INTO modules (name, slug, short_description, full_description, credit_cost, category,
                              display_order, status, visibility)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active','public')`,
        [m.name, m.slug, m.short_description, m.full_description, m.credit_cost, m.category, m.display_order]
      )
      console.log(`  ✓ Created: ${m.name}`)
      created++
    }
  }

  const { rows } = await client.query(`SELECT COUNT(*) FROM modules WHERE deleted_at IS NULL`)
  console.log(`\n✅ Modules done — ${created} created, ${updated} updated, ${rows[0].count} total\n`)

} catch (e) {
  await client.query('ROLLBACK')
  console.error('❌ Error:', e.message)
  process.exit(1)
} finally {
  client.release()
  await pool.end()
}
