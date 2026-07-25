# Frasers Adda — Backend System Design
### Job/Internship/Opportunity Platform with AI Resume Tools & Auto-Apply
Stack: Node.js + Prisma + PostgreSQL

---

## 1. What we're actually building

Core (like Unstop/Internshala/Naukri):
- Multi-role platform: **Student/Job-seeker**, **Recruiter/Company**, **Admin**
- Opportunities: Jobs, Internships, Hackathons, Contests, Quizzes
- Applications, saved jobs, filters/search, notifications, subscriptions

Differentiators (the AI layer):
- **AI Resume Test** — ATS-style scoring of resume vs a job description
- **AI Resume Update/Builder** — auto-improve or generate resume content
- **Auto Apply** — background agent that applies to matching jobs on user's behalf
- (Implied) **AI Job Matching** — recommend jobs based on resume/profile

Non-functional requirements to design around:
- Read-heavy (job browsing/search) but with bursty write spikes (application deadlines)
- AI calls are slow (2–15s) and costly → must be async, queued, cached
- Auto-apply must be rate-limited, auditable, and reversible (no runaway bot behavior)
- Must scale search/filtering (thousands of listings, faceted filters)

---

## 2. High-Level Architecture

```
                              ┌─────────────────────┐
                              │      Client Apps     │
                              │  (Web / Mobile app)  │
                              └──────────┬───────────┘
                                         │ HTTPS
                              ┌──────────▼───────────┐
                              │   API Gateway / LB    │  (Nginx / Cloud LB)
                              └──────────┬───────────┘
                                         │
                     ┌───────────────────┼────────────────────┐
                     │                   │                    │
             ┌───────▼───────┐  ┌────────▼────────┐  ┌────────▼────────┐
             │  Node.js API   │  │  Node.js API     │  │  Node.js API     │
             │  Instance 1    │  │  Instance 2      │  │  Instance N      │
             │ (Express/Nest) │  │ (stateless)      │  │ (stateless)      │
             └───────┬────────┘  └────────┬─────────┘  └────────┬─────────┘
                     │                    │                     │
        ┌────────────┼────────────────────┼─────────────────────┼──────────┐
        │            │                    │                     │          │
  ┌─────▼─────┐ ┌────▼─────┐      ┌───────▼───────┐     ┌───────▼──────┐  ┌▼─────────┐
  │ PostgreSQL │ │  Redis   │      │  BullMQ Queues │     │ Elastic /    │  │ S3 /     │
  │ (Prisma)   │ │ (cache + │      │  (jobs, workers)│     │ Meilisearch  │  │ Object   │
  │ + pgvector │ │ sessions)│      └───────┬───────┘     │ (search idx) │  │ Storage  │
  └────────────┘ └──────────┘              │             └──────────────┘  │(resumes, │
                                            │                                │ pdfs)   │
                              ┌─────────────▼──────────────┐                └─────────┘
                              │   Worker Processes (Node)   │
                              │  - resume-parse worker      │
                              │  - ai-score worker           │
                              │  - ai-resume-build worker    │
                              │  - auto-apply worker         │
                              │  - notification/email worker │
                              └─────────────┬────────────────┘
                                            │
                              ┌─────────────▼───────────────┐
                              │   AI Service Layer            │
                              │  (LLM API - OpenAI/Claude/    │
                              │   self-hosted embeddings)     │
                              └────────────────────────────────┘
```

**Key decision:** Start as a **modular monolith** (single Node.js codebase, clean module boundaries), not microservices. Split into services later (search, AI, auto-apply) only when a module's scaling/deploy needs genuinely diverge. Premature microservices = pain for a team your size.

---

## 3. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| API Framework | **NestJS** (over raw Express) | Enforces modular structure, DI, guards, pipes — matters a lot once you have 8+ modules and multiple devs |
| DB | PostgreSQL | Relational integrity (users, applications, companies), + `pgvector` extension for embeddings-based job matching |
| ORM | Prisma | Type-safe, migrations, good DX |
| Cache/Session | Redis | Session store, hot job listing cache, rate limiting |
| Queue | **BullMQ** (Redis-backed) | AI calls, resume parsing, auto-apply, emails — all async |
| Search | Meilisearch (or Elasticsearch if scale demands) | Faceted filters: role, location, skills, salary, type |
| File storage | S3 / Cloudflare R2 | Resumes, generated PDFs, company logos |
| Auth | JWT (access + refresh) + optional OAuth (Google/LinkedIn) | Standard, stateless-friendly |
| AI | LLM API (Claude/OpenAI) for scoring/generation + embeddings model for matching | Abstracted behind an internal `AIService` so provider is swappable |
| PDF generation | Puppeteer or `@react-pdf/renderer` | For AI resume builder output |
| Resume parsing | `pdf-parse` / `mammoth` (docx) + LLM for structuring | Extract raw text, then LLM structures into JSON schema |

---

## 4. Database Design (Prisma Schema)

```prisma
// schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

enum Role {
  STUDENT
  RECRUITER
  ADMIN
}

enum OpportunityType {
  JOB
  INTERNSHIP
  HACKATHON
  CONTEST
  QUIZ
}

enum ApplicationStatus {
  APPLIED
  IN_REVIEW
  SHORTLISTED
  REJECTED
  SELECTED
  WITHDRAWN
}

enum AppliedVia {
  MANUAL
  AUTO
}

enum AnalysisStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model User {
  id             String   @id @default(uuid())
  email          String   @unique
  password       String
  role           Role     @default(STUDENT)
  name           String
  phone          String?
  isVerified     Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  profile          Profile?
  resumes          Resume[]
  applications     Application[]
  autoApplyConfig  AutoApplyConfig?
  notifications    Notification[]
  subscription     Subscription?
  company          CompanyMember?     // if recruiter, links to a Company
  savedOpportunities SavedOpportunity[]
}

model Profile {
  id         String   @id @default(uuid())
  userId     String   @unique
  user       User     @relation(fields: [userId], references: [id])
  bio        String?
  location   String?
  education  Json?     // structured array [{degree, institute, year}]
  experience Json?     // structured array [{title, company, duration}]
  links      Json?     // {linkedin, github, portfolio}
  skills     Skill[]   @relation("ProfileSkills")
  updatedAt  DateTime  @updatedAt
}

model Skill {
  id        String     @id @default(uuid())
  name      String     @unique
  profiles  Profile[]  @relation("ProfileSkills")
  opportunities Opportunity[] @relation("OpportunitySkills")
}

model Resume {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  title      String
  fileUrl    String            // S3 URL of original upload / generated PDF
  parsedData Json?             // structured resume JSON extracted by AI
  isPrimary  Boolean  @default(false)
  version    Int      @default(1)
  createdAt  DateTime @default(now())

  analyses     AIResumeAnalysis[]
  applications Application[]
}

model AIResumeAnalysis {
  id              String         @id @default(uuid())
  resumeId        String
  resume          Resume         @relation(fields: [resumeId], references: [id])
  opportunityId   String?        // optional: scored against a specific JD
  opportunity     Opportunity?   @relation(fields: [opportunityId], references: [id])
  status          AnalysisStatus @default(PENDING)
  atsScore        Int?           // 0-100
  matchedKeywords Json?
  missingKeywords Json?
  strengths       Json?
  weaknesses      Json?
  suggestions     Json?          // actionable improvement points
  createdAt       DateTime       @default(now())
}

model Company {
  id        String   @id @default(uuid())
  name      String
  logoUrl   String?
  website   String?
  about     String?
  members   CompanyMember[]
  opportunities Opportunity[]
  createdAt DateTime @default(now())
}

model CompanyMember {
  id        String   @id @default(uuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  companyId String
  company   Company  @relation(fields: [companyId], references: [id])
  isOwner   Boolean  @default(false)
}

model Opportunity {
  id              String          @id @default(uuid())
  companyId       String
  company         Company         @relation(fields: [companyId], references: [id])
  title           String
  type            OpportunityType
  description     String
  location        String?
  isRemote        Boolean         @default(false)
  salaryMin       Int?
  salaryMax       Int?
  deadline        DateTime?
  isActive        Boolean         @default(true)
  skillsRequired  Skill[]         @relation("OpportunitySkills")
  embedding       Unsupported("vector(1536)")?   // for AI-based job matching
  createdAt       DateTime        @default(now())

  applications    Application[]
  analyses        AIResumeAnalysis[]
  savedBy         SavedOpportunity[]

  @@index([type, isActive])
  @@index([deadline])
}

model Application {
  id            String            @id @default(uuid())
  userId        String
  user          User              @relation(fields: [userId], references: [id])
  opportunityId String
  opportunity   Opportunity       @relation(fields: [opportunityId], references: [id])
  resumeId      String
  resume        Resume            @relation(fields: [resumeId], references: [id])
  status        ApplicationStatus @default(APPLIED)
  appliedVia    AppliedVia        @default(MANUAL)
  answers       Json?             // custom application form answers
  createdAt     DateTime          @default(now())

  @@unique([userId, opportunityId])
}

model AutoApplyConfig {
  id                 String   @id @default(uuid())
  userId             String   @unique
  user               User     @relation(fields: [userId], references: [id])
  isEnabled          Boolean  @default(false)
  preferredRoles     String[]
  preferredLocations String[]
  minSalary          Int?
  excludedCompanies  String[]
  resumeId           String            // resume to use for auto apply
  dailyLimit         Int      @default(5)
  lastRunAt          DateTime?
  updatedAt          DateTime @updatedAt
}

model SavedOpportunity {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  opportunityId String
  opportunity   Opportunity @relation(fields: [opportunityId], references: [id])
  createdAt     DateTime @default(now())

  @@unique([userId, opportunityId])
}

model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  type      String   // APPLICATION_UPDATE, AI_ANALYSIS_READY, AUTO_APPLY_SUMMARY, etc.
  title     String
  message   String
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())
}

model Subscription {
  id        String   @id @default(uuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  plan      String   // FREE, PRO, PRO_PLUS
  status    String   // ACTIVE, EXPIRED, CANCELLED
  startDate DateTime
  endDate   DateTime?
  paymentRef String?
}
```

Notes:
- `embedding vector(1536)` on `Opportunity` (and you'd add one on `Resume`/`Profile` too) lets you do cosine-similarity job matching directly in Postgres via `pgvector` — no separate vector DB needed at your scale.
- `AIResumeAnalysis` is decoupled from `Resume` as its own table (not a column) because a resume can be analyzed multiple times against multiple JDs — keeps history.
- Applications have a unique constraint on `(userId, opportunityId)` — prevents duplicate applies, including from the auto-apply worker.

---

## 5. AI Feature Design

### 5.1 AI Resume Test (ATS Score)

Flow:
1. User uploads resume (or picks existing) + optionally pastes a job description.
2. API creates `AIResumeAnalysis` row with `status: PENDING`, returns `analysisId` immediately (**don't block the request** on an LLM call).
3. Job pushed to `ai-score` queue.
4. Worker: extract text (if not already parsed) → build prompt with resume text + JD → call LLM → get structured JSON back (score, matched/missing keywords, strengths, weaknesses, suggestions) → validate shape → save to row, set `status: COMPLETED`.
5. Worker fires a `Notification` + optional WebSocket/SSE push so the frontend updates live instead of polling forever.
6. Frontend polls `GET /resumes/analysis/:id` or subscribes via WebSocket.

Prompt design tip: force the LLM to return **strict JSON** (use a schema in the system prompt, and validate with `zod` on the way back in). Retry once on invalid JSON before failing the job.

### 5.2 AI Resume Update / Builder

Two modes:
- **Improve existing**: take `parsedData` JSON of a resume + user's target role → LLM rewrites bullet points (stronger action verbs, quantify impact) → returns updated JSON → user reviews/accepts diffs section by section (don't silently overwrite).
- **Build from scratch**: conversational flow — collect structured inputs (education, experience, projects, skills) via a wizard, LLM helps phrase/polish each section as it's entered.

Once JSON is finalized → render to PDF (Puppeteer with an HTML/CSS resume template, or `@react-pdf/renderer`) → upload to S3 → create new `Resume` row (versioned).

### 5.3 Auto Apply (the one that needs the most care)

This is a background agent, not a live request — design it defensively:

1. User configures `AutoApplyConfig` (roles, locations, salary floor, resume to use, daily limit).
2. A **scheduled job** (cron via BullMQ repeatable job, e.g. every few hours) scans active `Opportunity` rows matching each user's criteria (use the `embedding` similarity + hard filters like location/salary as a first-pass filter, then rank).
3. For each candidate match:
   - Check `dailyLimit` not exceeded (count today's `Application` rows with `appliedVia: AUTO`).
   - Check no existing `Application` for that `(userId, opportunityId)`.
   - Check `excludedCompanies`.
   - If the opportunity requires custom question answers, use AI to draft answers from resume data — but **flag for review** if confidence is low rather than guessing.
   - Create `Application` with `appliedVia: AUTO`.
4. Push queue jobs per-user, not one giant loop — keeps failures isolated and retryable.
5. Rate-limit the whole worker against external ATS/company systems if you ever integrate real auto-submission to third-party portals (this is the part that gets abused/blocked — treat it like a bot-detection-sensitive integration).
6. Send a daily digest notification: "Auto-applied to 5 jobs today" with links, so it's never a black box.
7. **Audit log every auto-apply action** — user must be able to see and undo/withdraw.

This is the feature most likely to cause support/trust problems if it misfires (applying to wrong jobs, spamming recruiters) — build the daily cap, dedup, and audit trail before anything else, not as an afterthought.

---

## 6. Queue Architecture (BullMQ)

| Queue | Trigger | Notes |
|---|---|---|
| `resume-parse` | On resume upload | Extract text + structure into JSON |
| `ai-score` | On "Test my Resume" | LLM scoring call |
| `ai-resume-build` | On builder save/improve | LLM rewrite + PDF render |
| `auto-apply-scan` | Repeatable (cron) | Per-user scan, fans out to `auto-apply-execute` |
| `auto-apply-execute` | From scan | Single-application submission |
| `notifications` | Various | Email/push/in-app |
| `search-index-sync` | On opportunity create/update | Push to Meilisearch/Elastic |

All workers run as **separate Node processes** from the API (`worker.ts` entrypoint), scaled independently — AI queues need fewer, longer-running workers; notification queue needs many, fast ones.

---

## 7. API Structure (modules)

```
/auth          - register, login, refresh, OAuth
/users         - profile CRUD, skills
/resumes       - upload, list, set primary, delete
/resumes/analysis   - POST create analysis, GET status/result
/resumes/build      - AI builder endpoints (draft, improve, finalize)
/opportunities - CRUD (recruiter), search/filter (public), detail
/applications  - apply, list mine, withdraw, status
/auto-apply    - get/update config, enable/disable, history
/companies     - company profile, team members
/notifications - list, mark read
/subscriptions - plans, upgrade, webhook (payment provider)
/admin         - moderation, analytics
```

Use **NestJS modules** mapping 1:1 to this list — each with its own controller/service/DTOs, importing a shared `PrismaModule` and `AIModule`.

---

## 8. Folder Structure

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── guards/          (JwtAuthGuard, RolesGuard)
│   ├── decorators/       (@CurrentUser, @Roles)
│   ├── filters/          (global exception filter)
│   └── pipes/            (zod validation pipe)
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── modules/
│   ├── auth/
│   ├── users/
│   ├── resumes/
│   ├── ai/
│   │   ├── ai.service.ts        (LLM client wrapper, provider-agnostic)
│   │   ├── prompts/              (versioned prompt templates)
│   │   └── schemas/              (zod schemas for LLM JSON validation)
│   ├── opportunities/
│   ├── applications/
│   ├── auto-apply/
│   ├── companies/
│   ├── notifications/
│   └── subscriptions/
├── queues/
│   ├── queue.module.ts
│   ├── processors/
│   │   ├── resume-parse.processor.ts
│   │   ├── ai-score.processor.ts
│   │   ├── ai-resume-build.processor.ts
│   │   └── auto-apply.processor.ts
│   └── producers/
├── search/
│   └── meilisearch.service.ts
└── worker.ts   (separate bootstrap — runs only queue processors, no HTTP server)

prisma/
├── schema.prisma
└── migrations/
```

---

## 9. Security

- JWT access token (short-lived, ~15min) + refresh token (httpOnly cookie, rotated).
- `RolesGuard` on every recruiter/admin route — never trust `role` from client input.
- File upload validation: mime-type check + size cap + virus scan if budget allows, before it ever touches the `resume-parse` queue.
- Rate limit auth endpoints and AI endpoints separately (AI calls are expensive — cap "resume tests per day" per free-tier user).
- Sanitize/validate every LLM JSON response before writing to DB (never trust the model's output shape blindly).
- Auto-apply: hard server-side daily cap enforced in the worker itself, not just the UI.

---

## 10. Scalability Notes

- API servers are stateless → scale horizontally behind the LB trivially.
- Read replicas for Postgres once opportunity browsing read load grows; writes (applications, auto-apply) stay on primary.
- Cache hot/trending opportunity listings and search facets in Redis with short TTL.
- Move search fully to Meilisearch/Elasticsearch early — don't run filter-heavy queries directly against Postgres at scale.
- AI worker concurrency tuned separately from I/O-bound workers (LLM calls are network-bound, so decent concurrency per worker process is fine — just watch provider rate limits).
- `pgvector` with an IVFFlat/HNSW index handles matching at moderate scale; if you cross millions of embeddings, that's when you'd graduate to a dedicated vector DB (Pinecone/Qdrant) — not before.

---

## 11. Suggested Build Order (phased)

1. **Phase 1 — Core platform**: Auth, Profiles, Opportunities CRUD, Applications, basic search/filter.
2. **Phase 2 — Resumes**: Upload, parsing, versioning.
3. **Phase 3 — AI Resume Test**: Scoring pipeline end-to-end (this validates your whole async/queue/notification plumbing).
4. **Phase 4 — AI Resume Builder**: Reuses the same AI service layer from Phase 3.
5. **Phase 5 — Auto Apply**: Build last — depends on stable opportunity matching + a trustworthy application pipeline already in place.
6. **Phase 6 — Subscriptions, admin/analytics, scale-out (search engine, caching, read replicas)**.

Building AI Resume Test first (not auto-apply first) is deliberate — it forces you to get the queue/worker/notification/LLM-JSON-validation pattern right on a lower-stakes feature before you build the one that takes real-world actions on the user's behalf.
