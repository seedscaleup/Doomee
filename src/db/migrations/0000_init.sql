-- 0000_init — LOT 0 baseline.
--
-- No applicative table yet: LOT 1 introduces tenancy, the three PostgreSQL
-- roles (app_user / app_portal / app_migrator) and row level security.
--
-- Extensions only, so that the migration runner has something real to apply
-- and the test harness proves the whole chain works end to end.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
