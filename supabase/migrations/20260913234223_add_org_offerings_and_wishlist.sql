-- Reciprocal signup fields: what an organization could offer other
-- communities (expertise, content, mentorship), and what it wishes
-- nextVillage itself had more of. Optional, fillable at signup or later.

ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "org_offerings" "text",
  ADD COLUMN IF NOT EXISTS "org_wishlist" "text";
