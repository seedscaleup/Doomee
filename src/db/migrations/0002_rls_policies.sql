-- ===========================================================================
-- 0002 — Roles, privileges and row level security.
--
-- This migration is the security foundation of Doomee. Read it in full before
-- changing anything in it.
--
-- Three PostgreSQL roles (ADR-005):
--   app_user     internal sessions — rows of the current organisation only
--   app_portal   client portal     — reads ONLY the portal.* views
--   the migrator  the role running this file; owns the schema
--
-- app_user and app_portal are NOLOGIN group roles. The application connects as
-- a separate login role that is a member of both WITH NOINHERIT, and switches
-- into one of them per transaction with SET LOCAL ROLE. NOINHERIT matters:
-- PostgreSQL matches RLS policies with has_privs_of_role, so an INHERIT member
-- of both roles would receive the UNION of their policies. The login role is
-- created by scripts/provision-db (credentials never live in a migration).
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_portal') THEN
    CREATE ROLE app_portal NOLOGIN;
  END IF;
END
$$;

-- The portal reads through views only, so it gets its own schema.
CREATE SCHEMA IF NOT EXISTS portal;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA portal TO app_portal;

-- The portal must never touch a base table. Revoked explicitly, and again for
-- every future table via the default privileges below.
REVOKE ALL ON SCHEMA public FROM app_portal;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_portal;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- audit_logs is append-only: nothing may rewrite history, not even app_user.
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;

-- Tables created by later migrations inherit the same posture automatically,
-- so a forgotten GRANT cannot silently break the app, and a forgotten REVOKE
-- cannot silently expose the portal.
DO $$
DECLARE
  migrator text := current_user;
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user', migrator);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
       REVOKE ALL ON TABLES FROM app_portal', migrator);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA portal
       GRANT SELECT ON TABLES TO app_portal', migrator);
END
$$;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- FORCE is as important as ENABLE: without it the table owner (the migrator,
-- and anything running as it) would bypass every policy.
-- ---------------------------------------------------------------------------

-- organizations is the tenant root: its own id IS the boundary.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON organizations FOR ALL TO app_user
  USING      (id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (id = current_setting('app.organization_id', true)::uuid);

-- Applicative tables: filtered on organization_id, with no join, because the
-- column is present on every one of them even when a parent already carries it.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships FOR ALL TO app_user
  USING      (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitations FOR ALL TO app_user
  USING      (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions FOR ALL TO app_user
  USING      (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- Deliberate exceptions, each one reasoned in docs/database.md §13.
--
--   users       global by design: one person, one account, across several
--               organisations (ADR-023). Scoped by the application, never
--               reachable from the portal pool.
--   audit_logs  spans tenants and records platform-level actions. Append-only,
--               readable only by the platform operator.
--
-- The generated structural test knows this list; adding a table to it requires
-- editing tests/integration/rls-coverage.test.ts, which is the point.
-- ---------------------------------------------------------------------------
