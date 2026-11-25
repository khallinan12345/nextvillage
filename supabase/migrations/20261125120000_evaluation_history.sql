-- evaluation_history
-- Append-only companion to public.evaluations. `evaluations` is upserted in
-- place on every re-evaluation (one row per dashboard entry, no history —
-- see 20260815033105_create_evaluations.sql) — fine for "what's the current
-- score", useless for "did this learner improve attempt over attempt".
--
-- This table gets one new row every time src/lib/evaluations.ts's
-- saveEvaluation() is called, in addition to its existing upsert into
-- evaluations. No existing call site changes — the dual-write lives in
-- saveEvaluation() alone, so every one of its ~34 callers starts
-- contributing history automatically.
--
-- Used to compute longitudinal life-skill metrics (Grit, Feedback-
-- responsiveness) that need to compare one attempt's weakest criterion
-- against the next attempt's score on that same criterion. Nothing is
-- backfilled: history starts accumulating from the day this ships.

create table if not exists public.evaluation_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  dashboard_id  uuid not null references public.dashboard(id) on delete cascade,
  activity_type text not null,
  overall_score numeric(6,2),
  max_score     numeric(6,2) not null default 3,
  criteria      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists evaluation_history_user_idx
  on public.evaluation_history (user_id, activity_type, created_at);
create index if not exists evaluation_history_dashboard_idx
  on public.evaluation_history (dashboard_id, created_at);

alter table public.evaluation_history enable row level security;

-- A learner sees and writes only their own history. No update/delete
-- policy — it's an audit trail: once a snapshot is written, it stays.
drop policy if exists evaluation_history_select_own on public.evaluation_history;
create policy evaluation_history_select_own on public.evaluation_history
  for select using (auth.uid() = user_id);

drop policy if exists evaluation_history_insert_own on public.evaluation_history;
create policy evaluation_history_insert_own on public.evaluation_history
  for insert with check (auth.uid() = user_id);

comment on table public.evaluation_history is
  'Append-only snapshot written alongside every evaluations upsert (see saveEvaluation() in src/lib/evaluations.ts). One row per save, never overwritten — the history evaluations itself does not keep.';
