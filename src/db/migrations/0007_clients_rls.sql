-- ===========================================================================
-- 0007 — Row level security for the client domain.
--
-- Same posture as 0002: ENABLE and FORCE on every tenant table, one policy per
-- table, filtered on organization_id with no join.
--
-- invitations gains client_id here rather than in 0001 because it references
-- clients, which did not exist yet. Deferring the column was cheaper than
-- creating a stub table.
-- ===========================================================================

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS client_id uuid;

ALTER TABLE invitations
  ADD CONSTRAINT invitations_org_client_fk
  FOREIGN KEY (organization_id, client_id)
  REFERENCES clients (organization_id, id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Tenant tables
-- ---------------------------------------------------------------------------
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clients FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON client_contacts FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE client_user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_user_access FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON client_user_access FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON activity_events FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- A history that can be rewritten is not a history.
REVOKE UPDATE, DELETE ON activity_events FROM app_user;

-- ---------------------------------------------------------------------------
-- industries — reference data, deliberately readable across the boundary
--
-- System entries (organization_id IS NULL) are shared by every organisation:
-- that is the point of a seeded taxonomy. An organisation's OWN entries stay
-- private to it, so one team cannot read another's custom sectors.
-- ---------------------------------------------------------------------------
ALTER TABLE industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE industries FORCE ROW LEVEL SECURITY;

CREATE POLICY read_system_or_own ON industries FOR SELECT TO app_user
  USING (
    organization_id IS NULL
    OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );

-- Writes are scoped to the organisation: nobody edits a system entry, and
-- nobody creates one on another organisation's behalf.
CREATE POLICY write_own ON industries FOR INSERT TO app_user
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY update_own ON industries FOR UPDATE TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY delete_own ON industries FOR DELETE TO app_user
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
