-- ===========================================================================
-- 0004 — Treat an empty tenant setting as "no tenant".
--
-- Found by tests/integration/tenant-isolation.test.ts.
--
-- A custom GUC does not revert to NULL after a transaction that used
-- SET LOCAL: it reverts to the SESSION value, which is the empty string once
-- the parameter has been touched at all. On a pooled connection, the second
-- transaction therefore sees '' rather than NULL, and `''::uuid` raises
-- 22P02 instead of simply matching nothing.
--
-- The failure mode was fail-closed — an error, never a leak — but it breaks
-- any legitimate query that runs without a tenant context. nullif() makes the
-- empty string behave exactly like NULL: no match, no error.
-- ===========================================================================

ALTER POLICY tenant_isolation ON organizations
  USING      (id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER POLICY tenant_isolation ON memberships
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER POLICY tenant_isolation ON invitations
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER POLICY tenant_isolation ON subscriptions
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER POLICY same_organization_read ON users
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
       WHERE m.user_id = users.id
         AND m.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  );
