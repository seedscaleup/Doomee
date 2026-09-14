-- Extensions the schema depends on. Must run before any table.
-- All standard PostgreSQL contrib: nothing provider-specific (ADR-021).

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
