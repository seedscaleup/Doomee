-- ===========================================================================
-- 0002 — Roles, privileges and row level security.
--
-- This migration is the security foundation of Doomee. Read it in full before
-- changing anything in it.
--
-- Roles (ADR-005):
--   app_user      internal sessions — rows of the current organisation only
--   app_portal    client portal     — reads ONLY the portal.* views
--   the migrator  runs this file, owns the schema, and is also the role Better
--                 Auth connects as (identity has to work before any tenant is
--                 known)
--
-- app_user and app_portal are NOLOGIN group roles. The application connects as
-- a separate login role that is a member of both WITH NOINHERIT, and switches
-- into one per transaction with SET LOCAL ROLE. NOINHERIT is a security
-- requirement: PostgreSQL matches RLS policies with has_privs_of_role, so an
-- INHERIT member of both roles would receive the UNION of their policies.
-- The login role is created by src/db/provision.ts — credentials never live in
-- a migration.
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

CREATE SCHEMA IF NOT EXISTS portal;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA portal TO app_portal;

REVOKE ALL ON SCHEMA public FROM app_portal;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_portal;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- Identity tables are off limits to the application role. They carry no tenant
-- column, so app_user reading them would mean reading every session and every
-- credential hash on the platform. Only the migrator (Better Auth) touches them.
REVOKE ALL ON sessions, accounts, verifications FROM app_user;

-- audit_logs is append-only: nothing may rewrite history, not even app_user.
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;

-- Tables created by later migrations inherit the same posture automatically.
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
-- FORCE is as important as ENABLE: without it the table owner — and migrations
-- run as the owner — bypasses every policy.
-- ---------------------------------------------------------------------------

-- organizations is the tenant root: its own id IS the boundary.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations FOR ALL TO app_user
  USING      (id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (id = current_setting('app.organization_id', true)::uuid);

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
-- users — global rows, tenant-scoped VISIBILITY (ADR-028)
--
-- One person has one account across several organisations (ADR-023), so the
-- table cannot carry organization_id. Without a policy, app_user could read
-- every name and e-mail on the platform: an organisation could enumerate its
-- competitors' staff. A member is therefore visible only through a shared
-- membership in the CURRENT organisation.
--
-- ENABLE without FORCE, deliberately and uniquely: the owner must stay
-- unrestricted because Better Auth connects as it and has to find a user by
-- e-mail before any organisation is known. app_user is not the owner, so the
-- policy binds it.
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY same_organization_read ON users FOR SELECT TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
       WHERE m.user_id = users.id
         AND m.organization_id = current_setting('app.organization_id', true)::uuid
    )
  );

-- Profile changes go through Better Auth, which connects as the owner.
-- app_user may read a colleague's row; it may never write one.
REVOKE INSERT, UPDATE, DELETE ON users FROM app_user;

-- ---------------------------------------------------------------------------
-- Deliberate exceptions, reasoned in docs/database.md §13:
--
--   audit_logs  spans tenants and records platform-level actions. Append-only
--               for app_user, and readable only through a query that filters on
--               organization_id in the application layer.
--   sessions / accounts / verifications
--               identity, revoked from app_user entirely (above).
--
-- tests/integration/rls-coverage.test.ts knows this list. Adding to it means
-- editing that file, which is a reviewable act.
-- ---------------------------------------------------------------------------
