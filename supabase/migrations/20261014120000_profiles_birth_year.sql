-- Birth year (not full date of birth) so we can tell who is under 13 / under 16 / under 18
-- for consent and age-appropriate-design rules, while holding as little as possible about
-- minors. profiles.age stays as-is (it was almost never filled in and is not used).
--
-- Learners set it themselves once, through a one-time prompt in the app. The existing
-- "own profile" update policy and guard_profile_changes trigger already allow that.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_year smallint;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_birth_year_range,
  ADD CONSTRAINT profiles_birth_year_range
    CHECK (birth_year IS NULL OR birth_year BETWEEN 1920 AND 2100);

COMMENT ON COLUMN public.profiles.birth_year IS
  'Year of birth, self-reported once via the in-app prompt. Used only for age-based consent and safety rules.';
