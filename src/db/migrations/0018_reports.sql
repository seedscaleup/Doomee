CREATE TYPE "public"."export_format" AS ENUM('pdf', 'xlsx', 'csv');--> statement-breakpoint
CREATE TYPE "public"."report_section_key" AS ENUM('executive_summary', 'objectives', 'actions', 'deliverables', 'results', 'objectives_comparison', 'analysis', 'insights', 'attention_points', 'recommendations', 'next_steps');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'in_review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('weekly_internal', 'monthly', 'project', 'client', 'campaign_review', 'period_review');--> statement-breakpoint
CREATE TABLE "report_exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"format" "export_format" DEFAULT 'pdf' NOT NULL,
	"file_id" uuid,
	"locale" "locale_code" NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "report_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"key" "report_section_key" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_included" boolean DEFAULT true NOT NULL,
	"is_client_visible" boolean DEFAULT true NOT NULL,
	"title_override" text,
	"body" text,
	"data" jsonb,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_sections_key_key" UNIQUE("report_id","key")
);
--> statement-breakpoint
CREATE TABLE "report_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"password_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"recipient_email" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_shares_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "report_type" NOT NULL,
	"title" text NOT NULL,
	"project_id" uuid,
	"client_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"locale" "locale_code" DEFAULT 'fr' NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"snapshot" jsonb,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reports_org_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_org_report_fk" FOREIGN KEY ("organization_id","report_id") REFERENCES "public"."reports"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_org_file_fk" FOREIGN KEY ("organization_id","file_id") REFERENCES "public"."files"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_org_report_fk" FOREIGN KEY ("organization_id","report_id") REFERENCES "public"."reports"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_org_report_fk" FOREIGN KEY ("organization_id","report_id") REFERENCES "public"."reports"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_exports_org_report_idx" ON "report_exports" USING btree ("organization_id","report_id");--> statement-breakpoint
CREATE INDEX "report_sections_org_report_idx" ON "report_sections" USING btree ("organization_id","report_id");--> statement-breakpoint
CREATE INDEX "report_shares_org_report_idx" ON "report_shares" USING btree ("organization_id","report_id");--> statement-breakpoint
CREATE INDEX "reports_org_status_idx" ON "reports" USING btree ("organization_id","status","period_end");--> statement-breakpoint
CREATE INDEX "reports_org_client_idx" ON "reports" USING btree ("organization_id","client_id","period_end");--> statement-breakpoint

-- ===========================================================================
-- ROW LEVEL SECURITY — written by hand (CLAUDE.md §7).
-- ENABLE *and* FORCE on every applicative table.
-- ===========================================================================

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE reports FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON reports FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE report_sections ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE report_sections FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON report_sections FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE report_shares ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE report_shares FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON report_shares FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE report_exports FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON report_exports FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint

-- A published report is FROZEN (ADR-014). The snapshot it was published with
-- is what the client received; rewriting it would make the PDF in their inbox
-- and the page on their screen disagree.
--
-- UPDATE stays granted on `reports` — a draft is edited constantly, and
-- archiving a published one is a status change. The freeze is enforced by the
-- state machine and by a trigger below, not by revoking the verb.
CREATE OR REPLACE FUNCTION reports_snapshot_is_immutable() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'published' AND NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
    RAISE EXCEPTION 'a published report snapshot is immutable (ADR-014)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER reports_snapshot_immutable
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION reports_snapshot_is_immutable();--> statement-breakpoint

-- An export is a file that was generated at a moment. Regenerating means a new
-- row, so the trail of what was sent stays readable.
REVOKE UPDATE ON report_exports FROM app_user;--> statement-breakpoint

-- ===========================================================================
-- THE PORTAL — the Reports tab the LOT 9 shell left empty.
--
-- A client sees a report only once it is PUBLISHED, and only its
-- client-visible sections. Two conditions, as always: the status is readiness,
-- the flag is consent (ADR-057).
--
-- `settings` is absent from the view: it holds editor state, which is the
-- agency's business. `snapshot` is absent too — the portal reads the SECTIONS,
-- which is the same data in the shape a reader needs.
-- ===========================================================================
CREATE POLICY portal_read ON reports FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND status = 'published'
    AND deleted_at IS NULL
    AND (
      (project_id IS NOT NULL AND portal_sees_project(organization_id, project_id))
      OR (project_id IS NULL AND client_id = ANY (portal_client_ids()))
    )
  );--> statement-breakpoint

GRANT SELECT (id, organization_id, type, title, project_id, client_id,
              period_start, period_end, locale, published_at)
  ON public.reports TO app_portal;--> statement-breakpoint

-- A section hangs off its report, and the question "may this client see that
-- report?" is asked by a SECURITY DEFINER function rather than by an EXISTS in
-- the policy (ADR-061). An EXISTS over another table is an ordinary subquery
-- run with the CALLER's privileges: it would force `status` into the grant
-- above merely so a policy could read it. A function returning a boolean asks
-- the question without handing over the column.
CREATE OR REPLACE FUNCTION portal_sees_report(p_organization_id uuid, p_report_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reports r
     WHERE r.id = p_report_id
       AND r.organization_id = p_organization_id
       AND r.status = 'published'
       AND r.deleted_at IS NULL
       AND (
         (r.project_id IS NOT NULL AND portal_sees_project(r.organization_id, r.project_id))
         OR (r.project_id IS NULL AND r.client_id = ANY (portal_client_ids()))
       )
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION portal_sees_report(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_sees_report(uuid, uuid) TO app_portal;--> statement-breakpoint

CREATE VIEW portal.reports WITH (security_invoker = true) AS
  SELECT id, organization_id, type, title, project_id, client_id,
         period_start, period_end, locale, published_at
    FROM public.reports;--> statement-breakpoint

GRANT SELECT ON portal.reports TO app_portal;--> statement-breakpoint

-- A section reaches the client when it is included AND marked visible. The
-- `attention_points` section is excluded outright: it is the team's own list
-- of what is going wrong, and no amount of ticking makes it the client's.
CREATE POLICY portal_read ON report_sections FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_included
    AND is_client_visible
    AND key <> 'attention_points'
    AND portal_sees_report(organization_id, report_id)
  );--> statement-breakpoint

GRANT SELECT (id, organization_id, report_id, key, sort_order, title_override, body, data)
  ON public.report_sections TO app_portal;--> statement-breakpoint

CREATE VIEW portal.report_sections WITH (security_invoker = true) AS
  SELECT id, organization_id, report_id, key, sort_order, title_override, body, data
    FROM public.report_sections;--> statement-breakpoint

GRANT SELECT ON portal.report_sections TO app_portal;
--> statement-breakpoint

-- ===========================================================================
-- RESOLVING A SHARE TOKEN — the one lookup that runs without a tenant.
--
-- A share link carries no session: the token IS the authorisation. So the
-- organisation cannot come from a session, and must not come from the URL.
-- It comes from the token.
--
-- SECURITY DEFINER, and narrow on purpose: it returns the share's METADATA and
-- nothing else — no title, no content, no sections. The caller then opens an
-- ordinary tenant transaction and reads the report under RLS like everything
-- else. This function is the doorway, never the room.
--
-- It answers only when `app.share_token_hash` is set, so it is inert inside any
-- normal tenant transaction and cannot be used to widen one.
-- ===========================================================================
CREATE OR REPLACE FUNCTION share_by_token()
  RETURNS TABLE (
    id uuid,
    organization_id uuid,
    report_id uuid,
    password_hash text,
    expires_at timestamptz,
    revoked_at timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT s.id, s.organization_id, s.report_id, s.password_hash, s.expires_at, s.revoked_at
    FROM public.report_shares s
   WHERE nullif(current_setting('app.share_token_hash', true), '') IS NOT NULL
     AND s.token_hash = current_setting('app.share_token_hash', true);
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION share_by_token() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION share_by_token() TO app_user;--> statement-breakpoint

-- Counting a view must not require write access to the whole table from an
-- unauthenticated request path, so it is its own definer function — and it
-- only ever increments.
CREATE OR REPLACE FUNCTION share_record_view(p_share_id uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  UPDATE public.report_shares
     SET view_count = view_count + 1, last_viewed_at = now()
   WHERE id = p_share_id
     AND nullif(current_setting('app.share_token_hash', true), '') IS NOT NULL
     AND token_hash = current_setting('app.share_token_hash', true);
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION share_record_view(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION share_record_view(uuid) TO app_user;
