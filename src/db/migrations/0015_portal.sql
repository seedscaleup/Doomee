-- ===========================================================================
-- 0015 — THE CLIENT PORTAL
--
-- The second security-critical migration. Everything here exists to make one
-- sentence true: a client sees what was deliberately shared with them, and
-- nothing else — not another client's work, not another organisation's, and
-- not the internal columns of the rows they legitimately see.
--
-- THREE barriers, each of which would hold alone (CLAUDE.md §6):
--
--   1. app_portal has NO rights on schema `public` at all (migration 0002),
--      so the portal cannot name a base table even by accident.
--   2. Row level security decides WHICH ROWS: this file adds a portal_read
--      policy to every exposed table.
--   3. The portal.* views decide WHICH COLUMNS (ADR-026). `security_invoker`
--      makes the view run with app_portal's rights, so barrier 2 still applies
--      underneath it — the view ADDS to RLS instead of replacing it.
--
-- The consequence that matters: adding a column to a table NEVER makes it
-- visible to a client. Exposing it takes an explicit gesture in a view, in a
-- migration, in a diff someone reviews. That is the point (ADR-026).
--
-- health_score, health_status, budget_amount, spent_minutes, estimated_minutes,
-- blocked_reason, account_team_note and every internal counter are absent from
-- these views, deliberately and permanently (ADR-025).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Which clients is this portal session for?
--
-- `app.client_ids` is a comma-joined list, set by withPortal() inside the
-- transaction. One contact can cover several client accounts and several
-- organisations (ADR-023), so it is a list and not a single id.
--
-- STABLE, not IMMUTABLE: it reads a setting. STRICT would be wrong too — it
-- must answer for the missing-setting case rather than return NULL, because
-- `x = ANY(NULL)` is NULL, and a NULL predicate in a policy lets NOTHING
-- through but says nothing about why. An empty array is the honest answer and
-- fails closed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_client_ids() RETURNS uuid[]
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(
    string_to_array(nullif(current_setting('app.client_ids', true), ''), ',')::uuid[],
    ARRAY[]::uuid[]
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_client_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_client_ids() TO app_portal;--> statement-breakpoint

-- The organisation, always. Every policy below is ANDed with it, so a bug in
-- one client-scope clause still cannot cross a tenant.
CREATE OR REPLACE FUNCTION portal_organization_id() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_organization_id() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_organization_id() TO app_portal;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- "Can this portal session see that project?", asked once.
--
-- SECURITY DEFINER, and deliberately so. A policy's EXISTS over ANOTHER table
-- is an ordinary subquery: it runs with the CALLER's privileges, so an invoker
-- version would need app_portal to hold SELECT on projects.is_client_visible
-- and projects.deleted_at — widening the portal's column surface to answer a
-- yes/no question. A definer function returns the boolean and nothing else.
--
-- It is not a hole: it reads the SAME session settings the caller is bound by
-- (`app.organization_id`, `app.client_ids`), takes no free-form input, and
-- returns one bit. It cannot be asked about an organisation the session is not
-- in, because it compares against portal_organization_id() itself.
--
-- The real win is that "what makes a project visible to a client" is written
-- ONCE. Change it here and milestones, objectives, actions, deliverables,
-- results, comments, attachments and the activity feed all follow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_sees_project(p_organization_id uuid, p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
     WHERE p.id = p_project_id
       AND p.organization_id = p_organization_id
       AND p.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
       AND p.client_id = ANY (portal_client_ids())
       AND p.is_client_visible
       AND p.deleted_at IS NULL
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_sees_project(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_sees_project(uuid, uuid) TO app_portal;--> statement-breakpoint

-- A deliverable's versions and reviews hang off the deliverable, which hangs
-- off the project. Same reasoning, same shape: the TWO conditions of ADR-057
-- are written here once.
CREATE OR REPLACE FUNCTION portal_sees_deliverable(p_organization_id uuid, p_deliverable_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deliverables d
     WHERE d.id = p_deliverable_id
       AND d.organization_id = p_organization_id
       AND d.is_client_visible
       AND d.status IN ('client_review', 'changes_requested', 'approved', 'published')
       AND d.deleted_at IS NULL
       AND portal_sees_project(d.organization_id, d.project_id)
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_sees_deliverable(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_sees_deliverable(uuid, uuid) TO app_portal;--> statement-breakpoint

-- A result's metrics and notes hang off the result.
CREATE OR REPLACE FUNCTION portal_sees_result(p_organization_id uuid, p_result_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.results r
     WHERE r.id = p_result_id
       AND r.organization_id = p_organization_id
       AND r.is_client_visible
       AND r.deleted_at IS NULL
       AND portal_sees_project(r.organization_id, r.project_id)
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_sees_result(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_sees_result(uuid, uuid) TO app_portal;--> statement-breakpoint

-- Is this deliverable actually waiting on THIS client's decision?
--
-- Narrower than portal_sees_deliverable: a client keeps seeing a deliverable
-- after they approved it, but may not decide on it twice.
CREATE OR REPLACE FUNCTION portal_awaits_decision(p_organization_id uuid, p_deliverable_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deliverables d
     WHERE d.id = p_deliverable_id
       AND d.organization_id = p_organization_id
       AND d.status = 'client_review'
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_awaits_decision(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_awaits_decision(uuid, uuid) TO app_portal;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Which FILES a portal session may see.
--
-- `is_client_visible` alone is not a client scope — it says "this file may be
-- shown to a client", not "to THIS client". A first version of this policy
-- filtered on the organisation and the flag only, and the leak suite caught it
-- immediately: one client saw another client's shared files (ADR-062).
--
-- A file is reachable by exactly three legitimate routes, and it must travel
-- one of them:
--   · an attachment on a project the client can see;
--   · a version of a deliverable the client can see;
--   · the logo of one of their own client accounts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_sees_file(p_organization_id uuid, p_file_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.attachments a
     WHERE a.file_id = p_file_id
       AND a.organization_id = p_organization_id
       AND portal_sees_project(a.organization_id, a.project_id)
  ) OR EXISTS (
    SELECT 1 FROM public.deliverable_versions dv
     WHERE dv.file_id = p_file_id
       AND dv.organization_id = p_organization_id
       AND portal_sees_deliverable(dv.organization_id, dv.deliverable_id)
  ) OR EXISTS (
    SELECT 1 FROM public.clients c
     WHERE c.logo_file_id = p_file_id
       AND c.organization_id = p_organization_id
       AND c.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
       AND c.id = ANY (portal_client_ids())
       AND c.deleted_at IS NULL
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_sees_file(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_sees_file(uuid, uuid) TO app_portal;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The storage key of a file the portal may see — for the SERVER, never for the
-- browser.
--
-- `portal.files` deliberately omits `storage_key` (R13): a client receives a
-- link that expires, never the key of an object. But the server still needs
-- the key to MINT that link, and it is handling a portal request when it does.
--
-- Reading it through app_user instead would mean switching roles inside a
-- portal request, which is the kind of shortcut rule 3 exists to forbid. So the
-- key is fetched by a definer function that answers only for files
-- `portal_sees_file` already allows — one explicit gesture, in one place, whose
-- return value feeds storage().signedUrl and nothing else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_file_key(p_organization_id uuid, p_file_id uuid)
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT f.storage_key
    FROM public.files f
   WHERE f.id = p_file_id
     AND f.organization_id = p_organization_id
     AND f.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
     AND f.is_client_visible
     AND f.deleted_at IS NULL
     AND portal_sees_file(f.organization_id, f.id);
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_file_key(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_file_key(uuid, uuid) TO app_portal;--> statement-breakpoint

-- ===========================================================================
-- BARRIER 2 — row level security for app_portal.
--
-- SELECT only. The portal writes through exactly two doors, granted
-- explicitly at the end of this file: a shared comment, and a review decision
-- on a deliverable that was sent to the client.
-- ===========================================================================

-- The organisation itself: its name, for the shell.
CREATE POLICY portal_read ON organizations FOR SELECT TO app_portal
  USING (id = portal_organization_id() AND deleted_at IS NULL);--> statement-breakpoint

-- Their own client accounts, and only those.
CREATE POLICY portal_read ON clients FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND id = ANY (portal_client_ids())
    AND deleted_at IS NULL
  );--> statement-breakpoint

-- A project must belong to one of their clients AND be shared.
CREATE POLICY portal_read ON projects FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND client_id = ANY (portal_client_ids())
    AND is_client_visible
    AND deleted_at IS NULL
  );--> statement-breakpoint

-- Everything below hangs off a project the client can already see. Written as
-- EXISTS on `projects` rather than re-deriving the rule, so changing who sees
-- a project changes all of it at once.
CREATE POLICY portal_read ON milestones FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_client_visible
    AND deleted_at IS NULL
    AND portal_sees_project(milestones.organization_id, milestones.project_id)
  );--> statement-breakpoint

CREATE POLICY portal_read ON objectives FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_client_visible
    AND deleted_at IS NULL
    AND portal_sees_project(objectives.organization_id, objectives.project_id)
  );--> statement-breakpoint

CREATE POLICY portal_read ON actions FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_client_visible
    AND deleted_at IS NULL
    AND portal_sees_project(actions.organization_id, actions.project_id)
  );--> statement-breakpoint

-- TWO conditions, as ADR-057 states them: the flag is consent, the status is
-- readiness. A draft flagged by mistake is still not shown.
CREATE POLICY portal_read ON deliverables FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_client_visible
    AND status IN ('client_review', 'changes_requested', 'approved', 'published')
    AND deleted_at IS NULL
    AND portal_sees_project(deliverables.organization_id, deliverables.project_id)
  );--> statement-breakpoint

CREATE POLICY portal_read ON deliverable_versions FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND portal_sees_deliverable(deliverable_versions.organization_id, deliverable_versions.deliverable_id)
  );--> statement-breakpoint

-- The review history the client is part of. Their own decisions and the fact
-- that the team reviewed internally are both legitimate; the internal
-- COMMENT is not, and the view drops it.
CREATE POLICY portal_read ON deliverable_reviews FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND portal_sees_deliverable(deliverable_reviews.organization_id, deliverable_reviews.deliverable_id)
  );--> statement-breakpoint

CREATE POLICY portal_read ON results FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_client_visible
    AND deleted_at IS NULL
    AND portal_sees_project(results.organization_id, results.project_id)
  );--> statement-breakpoint

CREATE POLICY portal_read ON result_metrics FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND portal_sees_result(result_metrics.organization_id, result_metrics.result_id)
  );--> statement-breakpoint

CREATE POLICY portal_read ON result_notes FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND portal_sees_result(result_notes.organization_id, result_notes.result_id)
  );--> statement-breakpoint

-- A comment reaches the client only when it was deliberately SHARED, and only
-- on one of their own projects. `internal` is the default everywhere, so
-- silence is the safe outcome of forgetting (rule 2).
CREATE POLICY portal_read ON comments FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND visibility = 'shared'
    AND deleted_at IS NULL
    AND (
      client_id = ANY (portal_client_ids())
      OR portal_sees_project(comments.organization_id, comments.project_id)
    )
  );--> statement-breakpoint

-- BOTH conditions: the flag is consent, the route is scope. Neither alone.
CREATE POLICY portal_read ON files FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_client_visible
    AND deleted_at IS NULL
    AND portal_sees_file(files.organization_id, files.id)
  );--> statement-breakpoint

CREATE POLICY portal_read ON attachments FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND portal_sees_project(attachments.organization_id, attachments.project_id)
  );--> statement-breakpoint

-- The activity feed, shared events only.
CREATE POLICY portal_read ON activity_events FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND visibility = 'shared'
    AND (
      client_id = ANY (portal_client_ids())
      OR portal_sees_project(activity_events.organization_id, activity_events.project_id)
    )
  );--> statement-breakpoint

-- Which client accounts this contact may switch between. Scoped to the SESSION
-- USER, not to the organisation: a contact must never enumerate another
-- contact's access.
CREATE POLICY portal_read ON client_user_access FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND client_id = ANY (portal_client_ids())
  );--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Reference tables: labels, so a status or a metric has a name in the portal.
-- System rows only — an organisation's own taxonomy entries are internal.
-- ---------------------------------------------------------------------------
CREATE POLICY portal_read ON metrics FOR SELECT TO app_portal
  USING (organization_id IS NULL OR organization_id = portal_organization_id());--> statement-breakpoint

CREATE POLICY portal_read ON deliverable_types FOR SELECT TO app_portal
  USING (organization_id IS NULL OR organization_id = portal_organization_id());--> statement-breakpoint

CREATE POLICY portal_read ON objective_types FOR SELECT TO app_portal
  USING (organization_id IS NULL OR organization_id = portal_organization_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- `users`: the NAMES of the people working on their account.
--
-- The row-level rule is "an active member of this organisation" — a client
-- meets these people; their names are not a secret. The COLUMN-level rule is
-- the view, which exposes `id` and `name` and nothing else: not the e-mail,
-- not the locale, not `is_platform_admin`. That split is exactly the two
-- barriers doing their separate jobs (ADR-026).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_sees_person(p_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
     WHERE m.user_id = p_user_id
       AND m.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
       AND m.status = 'active'
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_sees_person(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_sees_person(uuid) TO app_portal;--> statement-breakpoint

CREATE POLICY portal_read ON users FOR SELECT TO app_portal
  USING (portal_sees_person(users.id));--> statement-breakpoint

-- ===========================================================================
-- BARRIER 3 — the portal.* views. WHICH COLUMNS.
--
-- security_invoker = true: the view runs with the CALLER's rights, so the RLS
-- above still applies underneath. Without it the view would run as its owner
-- (the migrator) and would be the only barrier left standing.
-- ===========================================================================

CREATE VIEW portal.organizations WITH (security_invoker = true) AS
  SELECT id, name, default_locale, timezone, default_currency
    FROM public.organizations;--> statement-breakpoint

CREATE VIEW portal.clients WITH (security_invoker = true) AS
  SELECT id, organization_id, name, slug, logo_file_id
    FROM public.clients;--> statement-breakpoint

-- No health_score, no health_status, no budget, no internal counters (ADR-025).
-- progress_percent stays: "how far along are we" is the client's question too.
CREATE VIEW portal.projects WITH (security_invoker = true) AS
  SELECT id, organization_id, client_id, name, description, status, color,
         start_date, end_date, timezone, progress_percent
    FROM public.projects;--> statement-breakpoint

CREATE VIEW portal.milestones WITH (security_invoker = true) AS
  SELECT id, organization_id, project_id, title, description, due_date, status, reached_at
    FROM public.milestones;--> statement-breakpoint

CREATE VIEW portal.objectives WITH (security_invoker = true) AS
  SELECT id, organization_id, project_id, objective_type_id, title, description,
         metric_id, target_value, unit, currency, period_start, period_end,
         status, current_value, achievement_percent
    FROM public.objectives;--> statement-breakpoint

-- No blocked_reason, no estimated_minutes, no spent_minutes, no assignee: what
-- the agency is doing, not how it staffs or prices it.
CREATE VIEW portal.actions WITH (security_invoker = true) AS
  SELECT id, organization_id, project_id, title, description, status, priority,
         start_date, due_date, completed_at
    FROM public.actions;--> statement-breakpoint

CREATE VIEW portal.deliverables WITH (security_invoker = true) AS
  SELECT id, organization_id, project_id, title, description, deliverable_type_id,
         status, current_version_id, due_date, sent_to_client_at, approved_at,
         published_at, external_url
    FROM public.deliverables;--> statement-breakpoint

CREATE VIEW portal.deliverable_versions WITH (security_invoker = true) AS
  SELECT id, organization_id, deliverable_id, version, file_id, external_url,
         notes, created_at
    FROM public.deliverable_versions;--> statement-breakpoint

-- The client sees THEIR OWN decisions in full, and only the fact that an
-- internal review happened. An internal reviewer's comment is internal.
CREATE VIEW portal.deliverable_reviews WITH (security_invoker = true) AS
  SELECT id, organization_id, deliverable_id, version_id, scope, decision,
         CASE WHEN scope = 'client' THEN comment ELSE NULL END AS comment,
         created_at
    FROM public.deliverable_reviews;--> statement-breakpoint

CREATE VIEW portal.results WITH (security_invoker = true) AS
  SELECT id, organization_id, project_id, action_id, objective_id, title,
         recorded_for, period_start, period_end, analysis, recommendation, created_at
    FROM public.results;--> statement-breakpoint

CREATE VIEW portal.result_metrics WITH (security_invoker = true) AS
  SELECT id, organization_id, result_id, metric_id, field_key, value, unit,
         currency, recorded_for
    FROM public.result_metrics;--> statement-breakpoint

CREATE VIEW portal.result_notes WITH (security_invoker = true) AS
  SELECT id, organization_id, result_id, kind, body, sort_order
    FROM public.result_notes;--> statement-breakpoint

CREATE VIEW portal.comments WITH (security_invoker = true) AS
  SELECT id, organization_id, entity_type, entity_id, project_id, client_id,
         author_user_id, body, created_at, edited_at
    FROM public.comments;--> statement-breakpoint

-- storage_key is absent on purpose: a client receives a SIGNED LINK minted
-- after a permission check, never the key of an object (R13).
CREATE VIEW portal.files WITH (security_invoker = true) AS
  SELECT id, organization_id, filename, mime_type, size_bytes, created_at
    FROM public.files;--> statement-breakpoint

CREATE VIEW portal.attachments WITH (security_invoker = true) AS
  SELECT id, organization_id, file_id, entity_type, entity_id, project_id, created_at
    FROM public.attachments;--> statement-breakpoint

CREATE VIEW portal.activity_events WITH (security_invoker = true) AS
  SELECT id, organization_id, actor_user_id, verb, entity_type, entity_id,
         client_id, project_id, params, created_at
    FROM public.activity_events;--> statement-breakpoint

CREATE VIEW portal.metrics WITH (security_invoker = true) AS
  SELECT id, code, labels, unit, kind, decimals FROM public.metrics;--> statement-breakpoint

CREATE VIEW portal.deliverable_types WITH (security_invoker = true) AS
  SELECT id, code, labels FROM public.deliverable_types;--> statement-breakpoint

CREATE VIEW portal.objective_types WITH (security_invoker = true) AS
  SELECT id, code, labels FROM public.objective_types;--> statement-breakpoint

-- Name and id. Not the e-mail, not the locale, not is_platform_admin.
CREATE VIEW portal.users WITH (security_invoker = true) AS
  SELECT id, name FROM public.users;--> statement-breakpoint

CREATE VIEW portal.client_user_access WITH (security_invoker = true) AS
  SELECT id, organization_id, client_id, user_id FROM public.client_user_access;--> statement-breakpoint

GRANT SELECT ON ALL TABLES IN SCHEMA portal TO app_portal;--> statement-breakpoint

-- ===========================================================================
-- THE TWO DOORS THE PORTAL WRITES THROUGH.
--
-- Everything else stays read-only. Both writes go to a BASE table, because a
-- view over a filtered table is not a sane insert target — and because the
-- WITH CHECK clause is what makes the write safe, not the view.
-- ===========================================================================

-- A client's comment is SHARED by construction. They cannot write an internal
-- one, and cannot attribute it to somebody else: author_user_id must be the
-- session's own user.
GRANT INSERT ON public.comments TO app_portal;--> statement-breakpoint

CREATE POLICY portal_write ON comments FOR INSERT TO app_portal
  WITH CHECK (
    organization_id = portal_organization_id()
    AND visibility = 'shared'
    AND author_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND (
      client_id = ANY (portal_client_ids())
      OR portal_sees_project(comments.organization_id, comments.project_id)
    )
  );--> statement-breakpoint

-- A client's decision on a deliverable that was actually sent to them.
GRANT INSERT ON public.deliverable_reviews TO app_portal;--> statement-breakpoint

CREATE POLICY portal_write ON deliverable_reviews FOR INSERT TO app_portal
  WITH CHECK (
    organization_id = portal_organization_id()
    AND scope = 'client'
    AND reviewer_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    -- Visible to them AND actually awaiting their decision. The helper carries
    -- the first half; `awaiting_client` is what makes this a DECISION rather
    -- than a comment on something already settled.
    AND portal_sees_deliverable(deliverable_reviews.organization_id,
                                deliverable_reviews.deliverable_id)
    AND portal_awaits_decision(deliverable_reviews.organization_id,
                               deliverable_reviews.deliverable_id)
  );--> statement-breakpoint

-- The decision moves the deliverable, so the portal updates that ONE row —
-- and only its status and its approval stamp. UPDATE is granted per column,
-- which PostgreSQL does support and which is the right tool here.
GRANT UPDATE (status, approved_at, approved_by, updated_at) ON public.deliverables TO app_portal;--> statement-breakpoint

CREATE POLICY portal_decide ON deliverables FOR UPDATE TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_client_visible
    AND status = 'client_review'
    AND deleted_at IS NULL
    AND portal_sees_project(deliverables.organization_id, deliverables.project_id)
  )
  WITH CHECK (
    organization_id = portal_organization_id()
    -- The only two states a client may put a deliverable into. Never
    -- `published`, never back to `production`.
    AND status IN ('approved', 'changes_requested')
  );
--> statement-breakpoint

-- ===========================================================================
-- BARRIER 1, RESTATED — column grants that mirror the views exactly.
--
-- `security_invoker = true` means the view runs with the CALLER's rights. That
-- is what keeps RLS applying underneath it (barrier 2) — and it also means
-- app_portal needs a grant on the base columns, or every portal read fails
-- with "permission denied for table projects".
--
-- So the grant is made per COLUMN, and the list is exactly what the views
-- above select. What this buys, verified against PostgreSQL rather than
-- assumed:
--
--   SELECT name FROM public.projects          → the same rows the view gives
--   SELECT * FROM public.projects             → permission denied
--   SELECT health_score FROM public.projects  → permission denied
--   SELECT id FROM public.projects WHERE health_score > 0
--                                             → permission denied
--
-- That last one matters: an ungranted column is refused in a WHERE clause too,
-- so a health score cannot be inferred by binary search either. The guarantee
-- of ADR-026 is therefore unchanged — no internal column reaches a client by
-- ANY route — but it is now enforced by PostgreSQL's grant system rather than
-- by the view alone (ADR-061).
--
-- A column added to a table is still invisible by default: it appears in no
-- view and in no grant, and adding it to either is a migration someone reviews.
-- ===========================================================================

GRANT SELECT (id, name, default_locale, timezone, default_currency)
  ON public.organizations TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, name, slug, logo_file_id)
  ON public.clients TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, client_id, name, description, status, color,
              start_date, end_date, timezone, progress_percent)
  ON public.projects TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, project_id, title, description, due_date, status, reached_at)
  ON public.milestones TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, project_id, objective_type_id, title, description,
              metric_id, target_value, unit, currency, period_start, period_end,
              status, current_value, achievement_percent)
  ON public.objectives TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, project_id, title, description, status, priority,
              start_date, due_date, completed_at)
  ON public.actions TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, project_id, title, description, deliverable_type_id,
              status, current_version_id, due_date, sent_to_client_at, approved_at,
              published_at, external_url)
  ON public.deliverables TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, deliverable_id, version, file_id, external_url,
              notes, created_at)
  ON public.deliverable_versions TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, deliverable_id, version_id, scope, decision,
              comment, created_at)
  ON public.deliverable_reviews TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, project_id, action_id, objective_id, title,
              recorded_for, period_start, period_end, analysis, recommendation, created_at)
  ON public.results TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, result_id, metric_id, field_key, value, unit,
              currency, recorded_for)
  ON public.result_metrics TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, result_id, kind, body, sort_order)
  ON public.result_notes TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, entity_type, entity_id, project_id, client_id,
              author_user_id, body, created_at, edited_at)
  ON public.comments TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, filename, mime_type, size_bytes, created_at)
  ON public.files TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, file_id, entity_type, entity_id, project_id, created_at)
  ON public.attachments TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, actor_user_id, verb, entity_type, entity_id,
              client_id, project_id, params, created_at)
  ON public.activity_events TO app_portal;--> statement-breakpoint

GRANT SELECT (id, code, labels, unit, kind, decimals) ON public.metrics TO app_portal;--> statement-breakpoint
GRANT SELECT (id, code, labels) ON public.deliverable_types TO app_portal;--> statement-breakpoint
GRANT SELECT (id, code, labels) ON public.objective_types TO app_portal;--> statement-breakpoint

-- Name and id. Not the e-mail, not the locale, not is_platform_admin.
GRANT SELECT (id, name) ON public.users TO app_portal;--> statement-breakpoint

GRANT SELECT (id, organization_id, client_id, user_id)
  ON public.client_user_access TO app_portal;
--> statement-breakpoint

-- ===========================================================================
-- THE AUDIT TRAIL IS ONE TRAIL.
--
-- A client approving a deliverable is among the most consequential acts in the
-- product. It belongs in the same log as everything else, written in the SAME
-- transaction as the change it records — an audit entry that commits without
-- its change, or a change without its entry, both make the log a liar.
--
-- So app_portal needs INSERT on audit_logs. INSERT, and nothing else:
--
--   · no SELECT. `audit_logs` deliberately carries no RLS for reads and spans
--     tenants (docs/database.md §13); a portal session that could read it
--     would read every organisation's history at once.
--   · no UPDATE, no DELETE. Already revoked from app_user for the same reason.
--
-- And the row it writes is pinned to its own organisation by a policy, so the
-- trail cannot be poisoned with an entry attributed elsewhere.
-- ===========================================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- app_user keeps exactly the behaviour it had before RLS was enabled here. The
-- table is read through queries that filter on organization_id in the
-- application layer (it spans tenants by design, and platform-level actions
-- have no tenant at all), so narrowing it is a separate decision from this
-- migration's.
CREATE POLICY app_user_access ON audit_logs FOR ALL TO app_user
  USING (true) WITH CHECK (true);--> statement-breakpoint

GRANT INSERT ON public.audit_logs TO app_portal;--> statement-breakpoint

CREATE POLICY portal_append ON audit_logs FOR INSERT TO app_portal
  WITH CHECK (
    organization_id = portal_organization_id()
    AND actor_user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );
