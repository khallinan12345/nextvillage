-- Widen public.evaluations' score columns from numeric(4,2) (max 99.99) to
-- numeric(6,2) (max 9999.99). AILearning/AIReadySkills use a 0-3 scale, but
-- the Foundations pages (English/Math/Science Skills) score sub-categories
-- 0-100 — a max_score of 100 would overflow numeric(4,2). Widening now
-- rather than assuming every future activity's rubric tops out under 100.

alter table public.evaluations
  alter column overall_score type numeric(6,2),
  alter column max_score type numeric(6,2);
