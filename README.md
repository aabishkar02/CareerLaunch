# Career Launch

A full-stack, course-first tutoring and career-training platform. Students enroll in courses and plans, book sessions with tutors on a timezone-aware calendar, pay via Stripe, and communicate in real time. Admins manage courses, modules, plans, tutor onboarding, fees, and refunds.

---

## Tech Stack

### Backend (`backend/`)

| Technology | Version | Purpose |
|---|---|---|
| Node.js | >= 20 | Runtime (ES modules) |
| Express | 5.x | HTTP API framework |
| Prisma | 7.x | ORM (`@prisma/client` + `@prisma/adapter-pg` driver adapter) |
| PostgreSQL | 16 | Primary database |
| Socket.IO | 4.x | Real-time messaging / help chat |
| Stripe | SDK 22.x | Payments, webhooks, refunds |
| jsonwebtoken + bcrypt | 9.x / 6.x | Auth — JWT access/refresh tokens in httpOnly cookies |
| Nodemailer | 8.x | Transactional email (SMTP) |
| Helmet, CORS, express-rate-limit | — | Security middleware |
| Jest 30 + Supertest | — | API tests (`src/tests/`) |

> **Prisma v7 note:** configuration lives in `backend/prisma.config.js` (not in `schema.prisma`'s datasource block). The active schema is `backend/prisma/schema.prisma`.

### Frontend (`frontend/`)

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3 | UI |
| Vite | 5.x | Dev server + build |
| React Router | 6.x | Client-side routing |
| Axios | 1.x | API client with auto token-refresh interceptor (`src/services/api.js`) |
| socket.io-client | 4.x | Real-time client |
| Lucide React | — | Icon set (icons only — no emojis in UI) |

Styling is plain CSS (`src/index.css`) following a Swiss-luxury design system: warm off-white backgrounds with a single deep-navy accent (`#1B3A6B`).

### Infrastructure

- **Docker** — `docker-compose.yml` (production: Postgres 16, Redis 7, backend, Nginx-served frontend) and `docker-compose.dev.yml` (development with source mounts).
- **Redis 7** is provisioned in Docker for future queue/cache use but is not yet wired into application code.

---

## Project Structure

```
career-launch/
├── package.json                # Root orchestration scripts (concurrently, prettier)
├── docker-compose.yml          # Production stack
├── docker-compose.dev.yml      # Development stack
├── Dockerfile.backend
├── Dockerfile.frontend
├── docs/
│   └── CareerLaunch_Frontend_Spec.docx
│
├── backend/
│   ├── server.js               # Entry point — Express + Socket.IO + security middleware
│   ├── prisma.config.js        # Prisma v7 config (schema + migrations paths, DATABASE_URL)
│   ├── prisma/
│   │   ├── schema.prisma       # Single source of truth for the DB schema
│   │   └── migrations/         # Prisma migration history
│   ├── database/
│   │   └── seeds/              # Seed scripts (run manually with node)
│   └── src/
│       ├── app.js              # Lean Express app used by Jest/Supertest tests
│       ├── config/             # db.js (Prisma client), socket.js, stripe.js
│       ├── controllers/        # Route handlers (auth, courses, sessions, payments, admin…)
│       ├── middleware/         # auth, validate, rateLimiter, errorHandler
│       ├── routes/             # Express routers, mounted in routes/index.js under /api/v1
│       ├── services/           # email.service.js, helpChatTimers.js
│       ├── tests/              # Jest + Supertest API tests
│       └── utils/              # dateHelper.js
│
└── frontend/
    ├── vite.config.js          # Dev server :5173, proxies /api and /socket.io → :3002
    └── src/
        ├── App.jsx             # Route definitions
        ├── index.css           # Global design system styles
        ├── components/         # Calendar, Navbar, HelpChatWidget, TimezoneSelector…
        ├── context/            # AuthContext
        ├── pages/              # Landing, Courses, Checkout + admin/ student/ tutor/ auth/
        ├── services/           # api.js (axios), socket.js, toast.js
        └── utils/              # timezone.js (Intl-based conversion, no date libraries)
```

### Key architectural patterns

- **API versioning** — all routes mounted under `/api/v1` (see `backend/src/routes/index.js`).
- **Auth** — JWT access + refresh tokens stored in httpOnly cookies; the frontend axios interceptor transparently refreshes on 401 and queues concurrent requests.
- **Timezones** — availability times are stored in the **tutor's timezone** and converted for students at display time using the native `Intl` API (no timezone libraries). See `frontend/src/utils/timezone.js` and `backend/src/utils/dateHelper.js`.
- **Stripe webhooks** — the webhook route receives the raw body (mounted before JSON parsing in `server.js`) for signature verification.
- **Real-time** — Socket.IO is initialised in `backend/src/config/socket.js` and used for messaging and the help-chat widget.
- **Audit logging** — admin/course mutations write to an `AuditLog` table via Prisma.

---

## Getting Started

### Prerequisites

- Node.js >= 20, npm >= 10
- PostgreSQL running locally (or use Docker)
- A Stripe test account (for payments)

### 1. Install dependencies

```bash
npm run install:all     # installs root, frontend, and backend deps
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env    # then fill in values
```

The important variables (see `backend/.env.example` for the full annotated list):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Generate strong random hex values |
| `PORT` | Backend port — **3002** in development (the Vite proxy expects this) |
| `FRONTEND_URL` | Comma-separated allowed CORS origins (default `http://localhost:5173`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe payments + webhook verification |
| `SMTP_HOST/PORT/USER/PASS` | Required for password-reset and notification emails |

The frontend has its own `frontend/.env` with `VITE_STRIPE_PUBLISHABLE_KEY`.

### 3. Set up the database

```bash
npm run migrate        # prisma migrate dev — applies migrations, generates client
```

Then seed initial data (order matters):

```bash
cd backend
node database/seeds/create_managed_tables.js
node database/seeds/seed_courses.js
node database/seeds/seed_modules.js
node database/seeds/seed_plans.js
```

### 4. Run the app

```bash
npm run dev            # runs frontend (:5173) and backend (:3002) concurrently
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/socket.io` to the backend, so no CORS configuration is needed in development.

---

## Development Workflow

| Command (from root) | What it does |
|---|---|
| `npm run dev` | Frontend + backend with hot reload (`vite` + `node --watch`) |
| `npm run test` | Backend Jest + Supertest suite |
| `npm run migrate` | Create/apply a dev migration after editing `schema.prisma` |
| `npm run generate` | Regenerate the Prisma client |
| `npm run format` | Prettier across the repo |
| `npm run build` | Production frontend build (`frontend/dist`) |
| `npm run docker:dev` | Full stack via Docker with source mounts |
| `npm run docker:prod` | Production stack (Nginx + built frontend, no exposed DB ports) |

Inside `backend/` you also have `npm run studio` (Prisma Studio DB browser) and `npm run migrate:prod` (`prisma migrate deploy` for deployments).

### Making schema changes

1. Edit `backend/prisma/schema.prisma` (the only schema file).
2. Run `npm run migrate` and give the migration a descriptive name.
3. The Prisma client regenerates automatically.

### Testing

Tests live in `backend/src/tests/` and run against the lean app in `src/app.js` via Supertest. They require a reachable database (`DATABASE_URL`).

```bash
npm run test                       # from root
npm run test:watch --prefix backend
```

---

## Deployment

Production runs via `docker-compose.yml`:

- **postgres** (16-alpine) and **redis** (7-alpine) on an internal-only network — no exposed ports.
- **backend** — built from `Dockerfile.backend`, health-checked on `/api/v1/health`.
- **frontend** — built React app served by Nginx on ports 80/443; SSL certs mounted from `./ssl`.

Set `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, and the `VITE_*` build args in a root `.env` (see `.env.example`), then:

```bash
npm run docker:prod
npm run migrate:prod   # apply migrations inside the deployed environment
```
