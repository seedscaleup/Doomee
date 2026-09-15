CREATE TABLE "insight_actions" (
	"organization_id" uuid NOT NULL,
	"insight_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insight_actions_insight_id_action_id_pk" PRIMARY KEY("insight_id","action_id")
);
--> statement-breakpoint
CREATE TABLE "insight_results" (
	"organization_id" uuid NOT NULL,
	"insight_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insight_results_insight_id_result_id_pk" PRIMARY KEY("insight_id","result_id")
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"client_id" uuid,
	"title" text NOT NULL,
	"what_worked" text,
	"what_didnt" text,
	"what_we_learned" text,
	"recommendation" text,
	"period_start" date,
	"period_end" date,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "insights_org_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "source_insight_id" uuid;--> statement-breakpoint
ALTER TABLE "insight_actions" ADD CONSTRAINT "insight_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_actions" ADD CONSTRAINT "insight_actions_org_insight_fk" FOREIGN KEY ("organization_id","insight_id") REFERENCES "public"."insights"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_actions" ADD CONSTRAINT "insight_actions_org_action_fk" FOREIGN KEY ("organization_id","action_id") REFERENCES "public"."actions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_results" ADD CONSTRAINT "insight_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_results" ADD CONSTRAINT "insight_results_org_insight_fk" FOREIGN KEY ("organization_id","insight_id") REFERENCES "public"."insights"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_results" ADD CONSTRAINT "insight_results_org_result_fk" FOREIGN KEY ("organization_id","result_id") REFERENCES "public"."results"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_org_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_org_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insight_actions_org_action_idx" ON "insight_actions" USING btree ("organization_id","action_id");--> statement-breakpoint
CREATE INDEX "insight_results_org_result_idx" ON "insight_results" USING btree ("organization_id","result_id");--> statement-breakpoint
CREATE INDEX "insights_org_project_idx" ON "insights" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "insights_org_client_idx" ON "insights" USING btree ("organization_id","client_id","created_at");--> statement-breakpoint

-- ===========================================================================
-- The composite key drizzle-kit cannot generate: `actions.source_insight_id`
-- is declared as a plain uuid in TypeScript because declaring the FK there
-- would make actions.ts import insights.ts, which imports actions.ts back.
--
-- It is added here, where both tables exist. ON DELETE SET NULL, not CASCADE:
-- deleting an insight must not delete the actions it gave rise to. The work
-- was done; only the reasoning is being withdrawn.
-- ===========================================================================
ALTER TABLE actions
  ADD CONSTRAINT actions_org_source_insight_fk
  FOREIGN KEY (organization_id, source_insight_id)
  REFERENCES insights (organization_id, id) ON DELETE SET NULL;--> statement-breakpoint

CREATE INDEX actions_org_source_insight_idx
  ON actions (organization_id, source_insight_id);--> statement-breakpoint

-- ===========================================================================
-- ROW LEVEL SECURITY — written by hand (CLAUDE.md §7).
-- ENABLE *and* FORCE: without FORCE the table owner bypasses its own policies,
-- and the migrator owns every table.
-- ===========================================================================

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE insights FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON insights FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE insight_results ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE insight_results FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON insight_results FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE insight_actions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE insight_actions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON insight_actions FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint

-- ===========================================================================
-- THE PORTAL.
--
-- An insight is where the agency says what it learned and what it recommends.
-- Shown to a client it is the most valuable page in the product; shown by
-- accident it is an internal post-mortem they were never meant to read.
--
-- So: opt-in like everything else, and the client sees the three fields that
-- face OUTWARD. `what_didnt` is deliberately absent from the view — "what went
-- wrong on our side" is a conversation an agency chooses to have, not one a
-- column leaks for it.
-- ===========================================================================
CREATE POLICY portal_read ON insights FOR SELECT TO app_portal
  USING (
    organization_id = portal_organization_id()
    AND is_client_visible
    AND deleted_at IS NULL
    AND (
      (project_id IS NOT NULL AND portal_sees_project(organization_id, project_id))
      OR (project_id IS NULL AND client_id = ANY (portal_client_ids()))
    )
  );--> statement-breakpoint

GRANT SELECT (id, organization_id, project_id, client_id, title, what_worked,
              what_we_learned, recommendation, period_start, period_end, created_at)
  ON public.insights TO app_portal;--> statement-breakpoint

CREATE VIEW portal.insights WITH (security_invoker = true) AS
  SELECT id, organization_id, project_id, client_id, title,
         what_worked, what_we_learned, recommendation,
         period_start, period_end, created_at
    FROM public.insights;--> statement-breakpoint

GRANT SELECT ON portal.insights TO app_portal;
