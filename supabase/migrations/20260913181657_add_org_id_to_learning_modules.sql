-- Tag learning_modules to the specific organization they were localized for,
-- rather than only by city/state/country. This lets two organizations that
-- happen to share a town get their own separate, independently-generated
-- module set instead of silently sharing one.

ALTER TABLE "public"."learning_modules"
  ADD COLUMN IF NOT EXISTS "organization_id" "uuid" REFERENCES "public"."organizations"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_learning_modules_organization_id"
  ON "public"."learning_modules" USING "btree" ("organization_id");
