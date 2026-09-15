CREATE TYPE "public"."risk_kind" AS ENUM('risk', 'issue');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'critical');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('open', 'mitigated', 'closed');--> statement-breakpoint
CREATE TABLE "project_health_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"status" "health_status" NOT NULL,
	"factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "risk_kind" DEFAULT 'risk' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"level" "risk_level" DEFAULT 'medium' NOT NULL,
	"impact" text,
	"probability" text,
	"owner_user_id" uuid,
	"identified_on" date,
	"mitigation_plan" text,
	"status" "risk_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "risks_org_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "project_health_snapshots" ADD CONSTRAINT "project_health_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_health_snapshots" ADD CONSTRAINT "project_health_snapshots_org_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_org_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_health_snapshots_org_project_idx" ON "project_health_snapshots" USING btree ("organization_id","project_id","computed_at");--> statement-breakpoint
CREATE INDEX "risks_org_project_idx" ON "risks" USING btree ("organization_id","project_id","status");--> statement-breakpoint
CREATE INDEX "risks_org_level_idx" ON "risks" USING btree ("organization_id","level","status");--> statement-breakpoint

-- ===========================================================================
-- ROW LEVEL SECURITY — written by hand (CLAUDE.md §7).
-- ENABLE *and* FORCE: without FORCE the table owner bypasses its own policies,
-- and the migrator owns every table.
-- ===========================================================================

ALTER TABLE risks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE risks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON risks FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE project_health_snapshots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE project_health_snapshots FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON project_health_snapshots FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint

-- A snapshot is what the score WAS at a moment. Rewriting one would turn the
-- health history into a story rather than a record — and the whole value of
-- the history is saying "this project has been sliding for three weeks".
REVOKE UPDATE ON project_health_snapshots FROM app_user;--> statement-breakpoint

-- ===========================================================================
-- THE PORTAL.
--
-- Risks: shared by a DELIBERATE act, like everything else (rule 2). A risk a
-- client can see is an act of transparency an agency chose to make.
--
-- 🔒 Health: NOTHING. No policy, no grant, no view — not now and not later
-- (ADR-025). `project_health_snapshots` is absent from this section on
-- purpose, and tests/integration/portal-leak.test.ts fails if that ever
-- changes.
-- ===========================================================================
CREATE POLICY portal_read ON risks FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_client_visible
    AND status <> 'closed'
    AND deleted_at IS NULL
    AND portal_sees_project(risks.organization_id, risks.project_id)
  );--> statement-breakpoint

-- The columns a client may see. No `probability` — an internal estimate of how
-- likely a project is to go wrong is a working note, not a statement to a
-- client. No owner, no internal bookkeeping.
GRANT SELECT (id, organization_id, project_id, kind, title, description, level,
              impact, identified_on, mitigation_plan, status, created_at)
  ON public.risks TO app_portal;--> statement-breakpoint

CREATE VIEW portal.risks WITH (security_invoker = true) AS
  SELECT id, organization_id, project_id, kind, title, description, level,
         impact, identified_on, mitigation_plan, status, created_at
    FROM public.risks;--> statement-breakpoint

GRANT SELECT ON portal.risks TO app_portal;
