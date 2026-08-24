-- learner_ai_memory
-- One row per user: a short, continuously-merged free-text summary of who
-- they are, what they care about, and what they've worked on — written by a
-- cheap Haiku call after a session (src/lib/learnerMemory.ts), read once at
-- the start of a session and folded into the system prompt on "Use Claude"
-- and "Systems Think". Deliberately a single capped-length text field, not a
-- structured schema — the writer prompt enforces a ~150 word budget by
-- merging new facts into the existing summary and dropping the
-- least-useful old detail if it would grow past that, so this never
-- meaningfully increases per-turn token cost.
--
-- Mirrors user_personality_baseline's shape/spirit but is more general
-- (any interesting fact, not just communication/learning-style scores) and
-- shared across both chat surfaces rather than scoped to one page.

create table if not exists public.learner_ai_memory (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  summary    text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.learner_ai_memory enable row level security;

drop policy if exists learner_ai_memory_select_own on public.learner_ai_memory;
create policy learner_ai_memory_select_own on public.learner_ai_memory
  for select using (auth.uid() = user_id);

drop policy if exists learner_ai_memory_insert_own on public.learner_ai_memory;
create policy learner_ai_memory_insert_own on public.learner_ai_memory
  for insert with check (auth.uid() = user_id);

drop policy if exists learner_ai_memory_update_own on public.learner_ai_memory;
create policy learner_ai_memory_update_own on public.learner_ai_memory
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No delete policy — a student doesn't need to destroy their own memory row
-- from the client, and leaving it out means an accidental delete can't succeed.
