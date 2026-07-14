# Archived migrations

These 8 files are no longer part of the active migration chain in `supabase/migrations/`. They're kept here for historical reference only — **do not run these against any database.**

## Why they were archived

The live database accumulated years of schema changes made directly through the Supabase dashboard (table editor), never captured in a migration. By July 2026, the tracked migration history covered a fraction of the actual live schema — whole tables (`organizations`, `dashboard`, `community_challenges`, the five community-impact consultation tables, and more) and dozens of columns on tables it did track (`profiles` alone was missing ~17 live columns) existed only in production, invisible to git.

Two of these files also made the situation worse in a way that broke tooling, not just documentation: `20260712230302_add_consultation_evidence_links.sql` and `20260713014638_add_enterprise_ledger.sql` use bare `CREATE TABLE` / `CREATE POLICY` statements (Postgres has no `IF NOT EXISTS` for policies). Combined with the missing baseline tables, the migration chain became fundamentally non-replayable from an empty database — `supabase db pull` and `supabase db diff` failed partway through trying to build a shadow database, because a later migration would try to `ALTER TABLE` a table no earlier migration had ever created.

## What replaced them

One new migration in `supabase/migrations/` containing the complete, accurate schema as of 2026-07-14 (via `supabase db dump --schema public` against the live database), which supersedes all 8 of these. Nothing was run against production to create it — production already had this exact state; the new migration exists so a **fresh** database (local dev, staging, disaster recovery) can be built from `supabase/migrations/` and actually match reality, which was not previously possible.

## Why they're kept instead of deleted

The commit messages and inline comments on some of these (particularly `20260712155711`, which explains the reasoning behind the consultation resolution-outcome design) document real product decisions. Deleting them would erase that context for no benefit — they're just not meant to be executed anymore.
