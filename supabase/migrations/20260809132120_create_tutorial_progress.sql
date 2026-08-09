-- tutorial_progress
-- One row per (user, track). Steps are stored as an array of step ids rather
-- than a row per step: the whole record is read and written together, the step
-- ids are stable strings defined in the track component, and a cohort of a few
-- hundred students will never make this table large enough to justify the join.
--
-- `artifacts` holds gate answers — the published site URL, the GitHub Pages
-- address, the GitHub username. These are the only real evidence the work
-- happened; a checkbox can be clicked, a URL either loads or it does not.

create table if not exists public.tutorial_progress (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  track           text not null,
  completed_steps text[] not null default '{}',
  artifacts       jsonb  not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, track)
);

create index if not exists tutorial_progress_user_idx  on public.tutorial_progress (user_id);
create index if not exists tutorial_progress_track_idx on public.tutorial_progress (track);

alter table public.tutorial_progress enable row level security;

-- A student sees and edits only their own progress.
drop policy if exists tutorial_progress_select_own on public.tutorial_progress;
create policy tutorial_progress_select_own on public.tutorial_progress
  for select using (auth.uid() = user_id);

drop policy if exists tutorial_progress_insert_own on public.tutorial_progress;
create policy tutorial_progress_insert_own on public.tutorial_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists tutorial_progress_update_own on public.tutorial_progress;
create policy tutorial_progress_update_own on public.tutorial_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No delete policy: progress is not something a student needs to destroy, and
-- leaving it out means an accidental client-side delete cannot succeed.

-- Cohort view for facilitators. Exposes counts and gate artifacts, never a
-- student's own auth record. Grant to whatever role your admin pages use.
create or replace view public.tutorial_progress_summary as
select
  track,
  count(*)                                              as students_started,
  count(*) filter (where array_length(completed_steps, 1) >= 12) as reached_episode_1_end,
  round(avg(coalesce(array_length(completed_steps, 1), 0))::numeric, 1) as avg_steps_done,
  max(updated_at)                                       as last_activity
from public.tutorial_progress
group by track;
