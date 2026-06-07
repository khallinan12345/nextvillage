# AI-ing & Vibing — Platform Summary

**Generated:** 2026-06-06

---

## Overview

AI-ing & Vibing is a comprehensive AI-powered learning platform targeting African youth and communities. It provides AI literacy education, technical skills training, community impact programs, and research capabilities. The platform is designed with strong Africa-first features including Nigerian English text-to-speech, offline assessment variants, and cost-efficient AI routing for low-bandwidth environments.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 18.3.1 + TypeScript 5.5.3 |
| Build Tool | Vite 5.4.2 with HMR |
| Routing | React Router DOM 6.22.3 |
| Styling | Tailwind CSS 3.4.1 (no component library) |
| Icons | Lucide React 0.344.0 |
| Auth & Database | Supabase (@supabase/supabase-js 2.98.0) |
| Deployment | Vercel (serverless functions) |
| Primary AI | Anthropic Claude (Haiku + Sonnet) |
| AI Fallbacks | Groq → Cerebras → Cloudflare → OpenRouter → Mistral → DeepSeek |
| Secondary AI | OpenAI, Google Gemini |
| Code Execution | E2B Code Interpreter + WebContainer API |
| Code Editor | Monaco Editor (@monaco-editor/react 4.7.0) |
| Email | Resend 6.9.4 |
| PDF Generation | jsPDF 3.0.4 |
| Animations | canvas-confetti 1.9.4 |
| Markdown | react-markdown 10.1.0, marked 15.0.12 |

---

## Architecture Overview

```
girls-aiing-and-vibing/
├── src/
│   ├── App.tsx                   # Root app with React Router (60+ routes)
│   ├── main.tsx                  # Vite entry point, AuthProvider wrapper
│   ├── pages/                    # 60+ page components organized by domain
│   │   ├── tech-skills/          # 27 specialized tech training pages
│   │   ├── community-impact/     # 13 programs + 13 certification pages
│   │   ├── research/             # 3 research lab pages
│   │   └── admin/                # Admin dashboards
│   ├── components/
│   │   ├── layout/               # Navbar, Sidebar, AppLayout
│   │   ├── auth/                 # AuthForm
│   │   ├── ui/                   # Button, Input, SpellCheckTextarea
│   │   ├── learning/             # VibeCodingWorkflow (multi-phase)
│   │   ├── profile/              # ProfileCompletionPopup
│   │   └── news/                 # NewsManager (platform announcements)
│   ├── hooks/
│   │   ├── useAuth.tsx           # Auth context + session management
│   │   ├── useVoice.ts           # Africa-aware TTS with fallbacks
│   │   ├── useHelpMeAnswer.ts    # AI tutoring help popup
│   │   └── useBranding.ts        # Dynamic org branding
│   ├── contexts/
│   │   └── ImpersonationContext.tsx  # Admin impersonation feature
│   ├── lib/
│   │   ├── supabaseClient.ts     # Supabase client instance
│   │   └── chatClient.ts         # chatText(), chatJSON() API wrappers
│   └── types/
│       └── supabase.ts           # TypeScript DB table definitions
├── api/                          # Vercel serverless functions (20+ endpoints)
│   ├── chat.js                   # Smart multi-provider LLM router
│   ├── image.js                  # Image generation proxy (DALL-E / Stable Diffusion)
│   ├── execute-code.ts           # Sandboxed code execution
│   ├── assess-baseline.ts        # Personality baseline assessment
│   ├── assess-monthly.ts         # Monthly skill assessment batch job
│   ├── research-submit.js        # Research data submission
│   ├── daily-report.ts           # Platform usage reports
│   ├── triage-webhook.ts         # Slack integration
│   ├── generate-react-code.ts    # AI code generation
│   ├── generate-web-code.ts
│   ├── generate-site-code.ts
│   ├── fullstack-task-instruction.ts
│   ├── site-task-instruction.ts
│   ├── ab730-evaluate-session.ts
│   └── ai900-task-instruction.ts
├── supabase/                     # Migrations and config
├── scripts/
│   ├── baseline.ts               # Assessment pipeline runner
│   └── monthly.ts
├── public/                       # Static assets
├── vite.config.ts                # Vite config (React plugin, /api proxy)
├── tailwind.config.js            # Custom theme (blue, purple, teal scales)
├── vercel.json                   # SPA routing config
└── package.json
```

---

## Routing Structure

### Public Routes (No Auth Required)
| Path | Page |
|---|---|
| `/` | PublicLandingPage — cohort stats, program showcase |

### Auth Routes
| Path | Page |
|---|---|
| `/login` | LoginPage |
| `/signup` | SignupPage |
| `/auth/reset-password` | ResetPasswordPage |
| `/auth/confirmation` | ConfirmationPage |
| `/auth/callback` | OAuth callback handler |

### Main App Routes (Auth Required)
| Path | Page |
|---|---|
| `/home` | HomePage — AI-ready skills overview |
| `/dashboard` | DashboardPage — projects, teams, challenges, leaderboards |
| `/profile` | ProfilePage — edit location, role, avatar, org |
| `/playground` | AIPlaygroundPage — multi-model LLM interface |

### Learning Routes
| Path | Page |
|---|---|
| `/learning/ai` | AILearningPage — personality-aware AI tutor |
| `/learning/skills` | SkillsDevelopmentPage — structured skill modules |
| `/english-skills` | English Skills |
| `/math-skills` | Math Skills |
| `/science-skills` | Science Skills |

### Tech Skills Routes (27 pages)
| Path | Page |
|---|---|
| `/tech-skills` | TechSkillsPage — hub |
| `/tech-skills/vibe-coding` | VibeCodingPage |
| `/tech-skills/web-development` | WebDevelopmentPage |
| `/tech-skills/full-stack-development` | FullStackDevelopmentPage |
| `/tech-skills/ai-image-creation` | ImageGenerationPage |
| `/tech-skills/ai-voice-creation` | VoiceCreationPage |
| `/tech-skills/ai-video-creation` | VideoGenerationPage |
| `/tech-skills/ai-video-studio` | VideoStudioPage |
| `/tech-skills/ai-content-creation` | AIContentCreationPage |
| `/tech-skills/ai-workflow-development` | AIWorkflowDevPage |
| `/tech-skills/ai-for-business` | AIForBusinessPage |
| `/tech-skills/microsoft-ai900` | MicrosoftAI900Page |
| `/tech-skills/microsoft-ab730` | MicrosoftAB730Page |
| `/tech-skills/github-gh300` | MicrosoftGH300Page |

### Certification Routes
| Path | Page |
|---|---|
| `/certifications/ai-proficiency` | AI Proficiency Cert |
| `/certifications/ai-ready-skills` | AI-Ready Skills Cert |
| `/certifications/vibe-coding` | Vibe Coding Cert |
| `/certifications/web-dev-certification` | Web Dev Cert |
| `/certifications/full-stack-certification` | Full Stack Cert |
| `/certifications/ai-video-production` | AI Video Production Cert |
| `/certifications/ai-image-creation-cert` | AI Image Creation Cert |
| `/certifications/ai-voice-creation` | AI Voice Creation Cert |
| `/certifications/ai-content-creation` | AI Content Creation Cert |
| `/certifications/ai-workflow-dev` | AI Workflow Dev Cert |
| `/certifications/ai-for-business` | AI for Business Cert |

### Community Impact Routes (26 pages: 13 base + 13 certifications)
| Path | Page |
|---|---|
| `/community-impact/ai-ambassadors` | AI Ambassadors |
| `/community-impact/agriculture` | Agriculture Consultant |
| `/community-impact/fishing` | Fishing Consultant |
| `/community-impact/healthcare` | Healthcare Navigator |
| `/community-impact/entrepreneurship` | Entrepreneurship Consultant |
| `/community-impact/animal-husbandry` | Animal Husbandry |
| `/community-impact/healthcare-offline` | Offline Clinical Assessment |
| `/community-impact/*/certification` | Certification variants for each program |

### Research Routes
| Path | Page |
|---|---|
| `/research/ai-learning-lab` | ResearchAILearningLab — phase-based research design |
| `/research/new` | ResearchNewProjectPage |
| `/research/igitree` | IGiTREE — longitudinal data explorer |

---

## Functional Domains

### 1. Authentication & Authorization

- **Supabase Auth** with email/password and OAuth
- **Profile Completion Popup** on first login — collects name, role, grade level, location, school
- **Role-based Access**: `student`, `teacher`, `facilitator`, `site_leader`, `research_lead`, `platform_administrator`
- **Multi-level Profiles**: continent, country, state, city; organization and team assignment via join codes
- **Admin Impersonation**: Admins can act as any learner without creating a new auth session. A persistent red banner indicates impersonation mode. State is stored in `sessionStorage` (survives page refresh within session only).

---

### 2. AI Tutoring & Personalized Learning

**AILearningPage** provides one-on-one AI tutoring with:
- Personality baseline loaded from `user_personality_baseline` table (communication strategy + learning strategy)
- Adaptive teaching tone and detail level based on learner profile
- Real-time chat with markdown rendering
- Voice input/output (Africa-aware TTS — see Voice section below)
- Baseline assessment triggered automatically after 10+ interactions

**SkillsDevelopmentPage** provides structured skill learning with continuous AI evaluation:
- Progress tracked per learning module: `not started` → `started` → `completed`
- Chat history persisted to DB per session
- Automatic evaluation after each user response
- Dimensional scoring on a 0–3 scale:
  - `0` — No Evidence
  - `1` — Emerging
  - `2` — Proficient
  - `3` — Advanced
- Module auto-completes when all dimensions reach Advanced
- Celebration animation (canvas-confetti) on completion

---

### 3. Vibe Coding (AI-Assisted Programming)

**VibeCodingPage** — Two-column layout: AI design coach (left) + workflow phases (right)

**VibeCodingWorkflow Component** — 4-phase multi-step workflow:
1. **Design** — AI helps brainstorm and shape the prompt
2. **Generate** — AI generates code
3. **Test** — AI helps debug and validate
4. **Refine** — Polish and optimize

Additional features:
- Code execution for Python, JavaScript, HTML via `/api/execute-code`
- Chat history persisted to `vibe_sessions` table
- AI coach adapts tone/detail to learner personality baseline

---

### 4. Tech Skills Training (27 Pages)

Each page provides task-based learning with AI evaluation and a certification variant with formal rubric assessment.

| Domain | Pages |
|---|---|
| Web & App Dev | Web Development, Full Stack Development |
| AI Media | Image Generation, Voice Creation, Video Generation, Video Studio |
| AI Business | AI Content Creation, AI Workflow Dev, AI for Business |
| Microsoft Certs | AI-900, AB-730, GH-300 |

---

### 5. Community Impact Programs (13 Programs)

Each program targets real-world community development with AI assistance:

| Program | Domain |
|---|---|
| AI Ambassadors | Train community leaders in AI |
| Agriculture Consultant | Crop advisory, pest management, soil health |
| Fishing Consultant | Sustainable fishing, market data, techniques |
| Healthcare Navigator | Health education, clinic navigation, wellness |
| Entrepreneurship Consultant | Business planning, marketing, finance |
| Animal Husbandry | Livestock care, breeding, disease management |

**Certification Structure (5 tiers):**
`Seed` → `Scout` → `Bridge` → `Builder` → `Multiplier`

- Return validation questions (Q1, Q2, Q3) to confirm real-world application
- Tier advancement based on assessment scores
- **Offline Assessment Variant**: `OfflineClinicalAssessment` for no-internet areas

---

### 6. Certification System

Applies across Tech Skills and Community Impact programs:

- **Multi-dimensional rubric evaluation** (4–5 dimensions per cert)
- **Color-coded performance levels**:
  - Red — No Evidence
  - Yellow — Emerging
  - Blue — Proficient
  - Green — Advanced
- Evidence snippets extracted from learner work
- Modal with full dimension breakdown
- Auto-completion when all dimensions reach highest level
- Confetti animation on success

---

### 7. Dashboard & Challenges

**DashboardPage** features:
- Live projects list (owned + team projects) with status tracking
- Teams management
- Weekly community challenges with tier targets
- Grand challenge quarters — submit projects, track status (`draft` → `submitted` → `winner`)
- Community leaderboard ranked by tier and actions
- Monthly progress summary with learner count, session count, avg skill delta graph
- Platform news banner (org-scoped or broadcast to all)

---

### 8. Research Programs

**ResearchAILearningLab** — Multi-phase research design for youth researchers:
- Phase 0: Data Orientation — teach metrics, show real anonymized data
- Longitudinal data exploration with k-anonymization (minimum group size: 5)
- Guiding questions per research area (cognition, equity, engagement, etc.)

**IGiTREE (ResearchIGiTREEPage)** — Longitudinal data explorer:
- Cohort overview: unique learners, sites, date range, avg months active
- Monthly trends, site comparisons, scaffold convergence metrics
- Real-time RPC calls to Supabase for aggregated data

---

### 9. AI Playground

**AIPlaygroundPage** — Multi-model LLM interface:
- Default model: Claude Haiku
- Selectable: Claude Sonnet (for advanced tasks)
- Free-tier fallback chain on error
- Per-learner cost tracking (userId + city attribution in API logs)
- System prompt customization
- Temperature and max_tokens controls

---

### 10. Africa-Aware Voice Features

**`useVoice` Hook** — Speech synthesis with Africa-first voice selection:

| Priority | Voice |
|---|---|
| 1 | en-NG (Nigerian English) |
| 2 | en-ZA (South African English) |
| 3 | Local en-* voices |
| 4 | en-GB female |
| 5 | en-US |

- Speech rate: 0.88x for African learners (slightly slower for clarity)
- Speech recognition language: `en-NG` for Africa, `en-US` for others
- Fallback to text display if TTS unavailable or fails

---

## Data Layer

### Supabase Database — Key Tables

| Table | Purpose |
|---|---|
| `profiles` | User profiles — role, location, school, organization, grade |
| `teams` | Team metadata |
| `projects` | Project records (owner, status, description) |
| `dashboard` | Per-learner module progress, chat history, evaluation scores |
| `user_personality_baseline` | Learner communication and learning strategy profiles |
| `assessments_monthly_global` | Monthly global metrics (learner count, session count, skill delta, certs) |
| `assessments_monthly_per_site` | Monthly per-organization metrics |
| `community_challenges` | Weekly challenge definitions (slug, tier target, instructions, return questions) |
| `community_leaderboard` | User rankings by tier and actions |
| `grand_challenges` | Quarterly challenge metadata |
| `grand_submissions` | User submissions (quarter, status, tier awarded) |
| `platform_news` | Org-scoped or broadcast announcements |
| `vibe_sessions` | Vibe coding chat history and prompt persistence |
| `organizations` | Org config (name, join codes, continent, country, city) |
| `research_programs` | Research lab programs with guiding questions |
| `research_projects` | User research projects with phases and submissions |

### API Endpoints

**`POST /api/chat`** — Main LLM router

Request fields: `messages`, `system`, `temperature`, `max_tokens`, `page`, `taskType`, `playgroundModel`

Provider routing by page type:
| Page Type | Provider Chain |
|---|---|
| Free-tier (tutoring, community) | Groq (Llama 3.3 70B) → Cerebras → Cloudflare → OpenRouter → Mistral → DeepSeek → Haiku |
| Coding pages (taskType=coding) | Anthropic Claude Haiku (reliability) |
| Coding pages (conversation) | Free-tier chain → Haiku final |
| Certification pages | Anthropic Claude Haiku only (structured JSON eval) |
| Playground | Haiku or user-selected model |
| Default | Anthropic Claude Haiku |

- Prompt caching enabled on all Anthropic calls (~10% cost savings on cache hits)
- Per-learner cost attribution via `userId + city` in logs

**`POST /api/image`** — Image generation proxy
- Request: `{ prompt, size }`
- Response: `{ b64: string }` (base64-encoded)
- Upstream: DALL-E 3 or Stable Diffusion

**`POST /api/execute-code`** — Sandboxed code execution
- Request: `{ code, language }` (python | javascript | html)
- Response: `{ output?, error?, executionTime? }`
- Implementation: E2B sandbox (Python) or WebContainer (JS/HTML)

**Assessment APIs:**
- `/api/assess-baseline` — Personality baseline (triggered at 10+ interactions)
- `/api/assess-monthly` — Monthly batch assessment (run as scheduled job)
- `/api/ab730-evaluate-session`, `/api/ai900-task-instruction` — Microsoft cert evaluators

**Other APIs:**
- `/api/research-submit` — Research data submission
- `/api/daily-report` — Platform usage reports
- `/api/triage-webhook` — Slack incident triage

---

## State Management

| Scope | Mechanism |
|---|---|
| Global auth & session | AuthContext via `useAuth()` hook |
| Admin impersonation | ImpersonationContext (sessionStorage) |
| Component UI state | React `useState` |
| Persistent learner data | Supabase DB (profiles, dashboard, etc.) |
| Chat history | Supabase DB (dashboard, vibe_sessions) |

---

## Styling Architecture

**Utility-First with Tailwind CSS (no component library)**

Custom theme in `tailwind.config.js`:
- Extended color scales: Blue (50–950), Purple (50–950), Teal (50–950)
- Custom animations: `fade-in`, `slide-up`
- Font: Inter sans-serif
- Background: Gray-50 global

`src/index.css` custom layers:
- `@layer base` — heading sizes, link colors
- `@layer components` — `.container`, `.wide-container`, `.sidebar-link`, `.navbar-link`

**Organization Branding:** `useBranding()` hook applies custom colors and logos per organization.

---

## Notable Integrations

| Integration | Purpose |
|---|---|
| Anthropic Claude (Haiku + Sonnet) | Code generation, evaluation, tutoring, certification rubrics |
| Groq (Llama 3.3 70B) | Primary free-tier AI (fastest) |
| OpenAI | Image generation (DALL-E), secondary LLM |
| Google Gemini | Fallback LLM |
| Cerebras, Cloudflare, OpenRouter, Mistral, DeepSeek | Free-tier fallback chain |
| E2B Code Interpreter | Python sandboxed execution |
| WebContainer API | Browser-native JS/HTML execution |
| Supabase | Auth, Postgres DB, realtime, RPC functions |
| Resend | Transactional email (confirmations, reports) |
| Slack Webhook | Incident triage and daily metrics |
| Vercel | Serverless deployment + hosting |

---

## Deployment

**Local Development:**
```bash
npm install
npm run dev          # Vite dev server at http://localhost:5173
                     # /api/* proxied to localhost:3001
```

**Build & Deploy:**
```bash
npm run build        # Vite production build → dist/
npm run preview      # Test production build locally
vercel deploy        # Deploy to Vercel
```

**Scheduled Scripts:**
```bash
npm run assess:baseline   # Trigger personality baseline assessment
npm run assess:monthly    # Run monthly assessment batch job
npm run lint              # ESLint validation
```

**Environment Variables (.env.local):**
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
GOOGLE_API_KEY
GROQ_API_KEY
CEREBRAS_API_KEY
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_AI_TOKEN
OPENROUTER_API_KEY
MISTRAL_API_KEY
DEEPSEEK_API_KEY
E2B_API_KEY
RESEND_API_KEY
SLACK_WEBHOOK_URL
```

**Vercel Configuration (`vercel.json`):**
- SPA routing: all unmatched paths → `/index.html` (React Router handles client-side routing)
- `api/` directory auto-deployed as serverless functions

---

## Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Multi-provider AI fallback chain | Cost efficiency — free-tier providers handle ~80% of traffic before paid Anthropic calls |
| Claude Haiku only for cert evaluation | Structured JSON rubric output requires reliable, consistent model behavior |
| Prompt caching on all Anthropic calls | ~10% cost reduction on repeated system prompts |
| No component library | Full visual control, no framework lock-in, smaller bundle |
| Supabase over custom backend | Managed auth, realtime, and RLS without a separate API server |
| Africa-first TTS voice selection | Platform's primary user base is in West/East Africa; Nigerian English is the priority voice |
| Offline assessment variant | Connectivity gaps in target regions; offline-capable clinical assessments ensure no learner is blocked |
| k-anonymization in research (min group 5) | Protect learner privacy in longitudinal data exploration by youth researchers |
| Per-learner cost attribution in API logs | Enables cost analysis by geography and role for funding/grant reporting |
