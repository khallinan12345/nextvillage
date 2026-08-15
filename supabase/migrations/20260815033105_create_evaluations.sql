-- evaluations
-- Shared rubric-evaluation store, replacing the pattern of adding a new
-- certification_evaluation_<criterion>_score/_evidence column pair to
-- public.dashboard for every activity's rubric. One row per (dashboard
-- entry), upserted in place each time an activity is (re-)evaluated —
-- matches the existing overwrite-on-re-evaluate behavior, no history.
--
-- `criteria` holds the per-criterion breakdown as a JSON array so any
-- activity can define its own rubric shape without a schema change:
--   [{ "key": "understanding_ai", "label": "Understanding of AI",
--      "score": 2, "max_score": 3, "evidence": "..." }, ...]
--
-- `activity_type` is a stable per-activity key (e.g. 'ai_learning'),
-- analogous to the `page` routing key already used in api/chat.js —
-- lets one shared evaluation UI component render any activity's rubric.
--
-- This is additive: existing certification_evaluation_* columns on
-- dashboard are untouched for now. Pages migrate to this table one at a
-- time; until a page's other readers (dashboard/profile score badges)
-- are also migrated, that page dual-writes both places.

create table if not exists public.evaluations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  dashboard_id  uuid not null references public.dashboard(id) on delete cascade,
  activity_type text not null,
  overall_score numeric(4,2),
  max_score     numeric(4,2) not null default 3,
  evidence      text,
  criteria      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (dashboard_id)
);

create index if not exists evaluations_user_idx          on public.evaluations (user_id);
create index if not exists evaluations_activity_type_idx on public.evaluations (activity_type);

alter table public.evaluations enable row level security;

-- A learner sees and writes only their own evaluations.
drop policy if exists evaluations_select_own on public.evaluations;
create policy evaluations_select_own on public.evaluations
  for select using (auth.uid() = user_id);

drop policy if exists evaluations_insert_own on public.evaluations;
create policy evaluations_insert_own on public.evaluations
  for insert with check (auth.uid() = user_id);

drop policy if exists evaluations_update_own on public.evaluations;
create policy evaluations_update_own on public.evaluations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No delete policy: same reasoning as tutorial_progress — a learner has
-- no legitimate reason to destroy their own evaluation record, and
-- omitting the policy means an accidental client-side delete can't
-- succeed even if some future code path attempted one.

comment on table public.evaluations is
  'Generic rubric-evaluation store shared across activity pages. One row per dashboard entry, upserted on re-evaluation. criteria is a JSON array of {key,label,score,max_score,evidence}.';
