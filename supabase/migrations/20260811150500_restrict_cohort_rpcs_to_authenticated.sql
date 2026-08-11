-- This project's public schema has a default privilege that auto-grants
-- EXECUTE to anon on every new function (confirmed via pg_default_acl) —
-- so `REVOKE ALL ... FROM PUBLIC` in the prior migration did not actually
-- restrict get_cohort_member_names / get_organization_learner_count to
-- authenticated callers, since that default grant is a separate per-role ACL
-- entry, not something routed through the PUBLIC pseudo-role. Revoke the
-- anon grant explicitly.

REVOKE EXECUTE ON FUNCTION "public"."get_cohort_member_names"("text") FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."get_organization_learner_count"("uuid") FROM "anon";
