-- The three pre-existing localized communities (Oloibiri, Ibiade, Dayton)
-- predate the organization_id column on learning_modules — their rows were
-- only ever tagged by city_town. Backfill organization_id to the single
-- canonical, actively-used organization in each city so read queries that
-- now prefer organization_id keep working for them, and so their content is
-- no longer only reachable by a city-name string match.
--
-- Canonical orgs (confirmed by member count — each city had other stray/
-- low-membership orgs that were never the one this content was written for):
--   Oloibiri -> Davidson AI Futures Lab   (a1b2c3d4-0001-0001-0001-000000000001, 141 members)
--   Ibiade   -> Solardero Foundation      (a1b2c3d4-0002-0002-0002-000000000002, the only Ibiade org)
--   Dayton   -> Back to Basics Youth Education (bf573bfa-c57a-4476-be26-508991bb4d76, 22 members —
--               Dayton also has Girls AI Camp Dayton, University of Dayton, and Npower, which have
--               never had their own localized content and are NOT backfilled here)

UPDATE learning_modules
SET organization_id = 'a1b2c3d4-0001-0001-0001-000000000001'
WHERE city_town = 'Oloibiri' AND organization_id IS NULL;

UPDATE learning_modules
SET organization_id = 'a1b2c3d4-0002-0002-0002-000000000002'
WHERE city_town = 'Ibiade' AND organization_id IS NULL;

UPDATE learning_modules
SET organization_id = 'bf573bfa-c57a-4476-be26-508991bb4d76'
WHERE city_town = 'Dayton' AND organization_id IS NULL;
