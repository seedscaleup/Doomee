-- ===========================================================================
-- 0003 — The organisation switcher, without weakening tenant isolation.
--
-- The problem: listing the organisations a person belongs to spans tenants by
-- nature, but memberships is filtered by app.organization_id, so a query with
-- no tenant context returns nothing — correctly.
--
-- The tempting fix would be a policy like "a user may always see their own
-- memberships". That is wrong: inside a normal tenant transaction it would ALSO
-- return their rows in other organisations, so a plain SELECT on memberships in
-- org A would silently include a row from org B, corrupting every count and
-- every list built on it.
--
-- These two policies are therefore guarded to apply ONLY when there is no
-- tenant context at all. Inside withTenant they are inert; outside, they return
-- nothing but the caller's own rows. src/db/tenant.ts::withUserLookup is the
-- only place that opens such a transaction.
-- ===========================================================================

CREATE POLICY own_memberships_lookup ON memberships FOR SELECT TO app_user
  USING (
    coalesce(current_setting('app.organization_id', true), '') = ''
    AND user_id = nullif(current_setting('app.lookup_user_id', true), '')::uuid
  );

CREATE POLICY own_organizations_lookup ON organizations FOR SELECT TO app_user
  USING (
    coalesce(current_setting('app.organization_id', true), '') = ''
    AND EXISTS (
      SELECT 1 FROM memberships m
       WHERE m.organization_id = organizations.id
         AND m.user_id = nullif(current_setting('app.lookup_user_id', true), '')::uuid
    )
  );
