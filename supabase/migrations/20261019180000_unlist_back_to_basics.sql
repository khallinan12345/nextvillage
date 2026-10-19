-- Back to Basics Youth Education is no longer connected to the platform (Kevin, 19 Oct 2026). It is no longer
-- offered at sign-up or in the placement picker. Its members and data are kept: nothing is deleted here.
--
UPDATE public.organizations SET is_listed = false WHERE name = 'Back to Basics Youth Education';
