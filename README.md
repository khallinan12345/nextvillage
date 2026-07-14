# AI'ing & Vibing (vAI)

An AI-facilitated learning platform for young people in rural communities to develop the skills to lead their own futures — learning modules, AI-tool workshops, certifications, and real community-impact challenges (health, agriculture, fishing, entrepreneurship, animal husbandry), with facilitator/admin dashboards to track outcomes for grant reporting.

## Tech stack

- **Frontend**: Vite + React + TypeScript, React Router, Tailwind CSS
- **Backend**: Supabase (Postgres, Auth, Storage, Edge Functions) + Vercel serverless functions (`api/`)
- **AI providers**: Anthropic, OpenAI, Groq, Cerebras, Together, Hugging Face — routed through `api/chat.js` and related proxy endpoints
- **Email**: Resend (transactional/auth email via Supabase SMTP)
- **Hosting**: Vercel (auto-deploys `main`)

## Local setup

```bash
npm install
```

Copy `.env.local.example` if one exists, or ask a teammate for a `.env.local` — it's git-ignored and not checked in. Required variables fall into a few groups:

- **Supabase**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **AI providers**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` / `VITE_OPENAI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `AI_TOGETHER_API_KEY`, `HF_TOKEN`
- **Email**: `RESEND_API_KEY`
- **Misc third-party**: `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`, `SPEECHGEN_EMAIL` / `SPEECHGEN_TOKEN` / `SPEECHGEN_VOICE`, `NEWS_API_SECRET`, `CRON_SECRET`

```bash
npm run dev          # frontend (Vite) + local backend (real-e2b-server.cjs) together
npm run dev:frontend # just Vite
npm run dev:backend  # just the backend server
```

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | Production build |
| `npm test` | Run the Vitest suite |
| `npm run deadcode` | Scan for unused files/dependencies (knip) — informational, not a CI gate |
| `npm run lint` | ESLint |
| `npm run assess:baseline` / `assess:monthly` | Standalone scripts for the personality/proficiency assessment pipeline |

## Database & migrations

Schema lives in `supabase/migrations/` as a single baseline migration reflecting the actual live schema (reset 2026-07-14 — see `supabase/migrations_archive/README.md` for why). All future schema changes should be new migration files layered on top of that baseline, not made directly through the Supabase dashboard — direct dashboard edits are exactly what caused the previous migration history to drift from reality.

To pull the current live schema and check for drift:

```bash
supabase db pull    # requires Docker (or a lightweight alternative like colima) for the shadow database
```

## Contributing

Full process (branching, PRs, what the CI check verifies) is in [`docs/GitHub-Push-Process-Report.pdf`](docs/GitHub-Push-Process-Report.pdf). Short version: branch off `development`, open a PR into `main`, wait for the `typecheck-and-build` check (which also runs the test suite) to pass, merge. Direct pushes to `main` are blocked for everyone except the repo owner.

## Deployment

Vercel auto-deploys on push to `main`. Preview deployments are generated for every PR.
