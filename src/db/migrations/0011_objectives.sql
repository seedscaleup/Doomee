CREATE TYPE "public"."metric_agg" AS ENUM('sum', 'avg', 'last', 'max', 'min');--> statement-breakpoint
CREATE TYPE "public"."metric_direction" AS ENUM('higher_is_better', 'lower_is_better', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."metric_kind" AS ENUM('integer', 'decimal', 'currency', 'percent', 'ratio', 'duration');--> statement-breakpoint
CREATE TYPE "public"."objective_status" AS ENUM('draft', 'active', 'achieved', 'missed', 'cancelled');--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"code" text NOT NULL,
	"labels" jsonb NOT NULL,
	"unit" text,
	"kind" "metric_kind" DEFAULT 'integer' NOT NULL,
	"aggregation" "metric_agg" DEFAULT 'sum' NOT NULL,
	"direction" "metric_direction" DEFAULT 'higher_is_better' NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"is_computed" boolean DEFAULT false NOT NULL,
	"formula" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "metrics_org_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "objective_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"code" text NOT NULL,
	"labels" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"objective_type_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"metric_id" uuid,
	"target_value" numeric(20, 4),
	"unit" text,
	"currency" char(3),
	"period_start" date,
	"period_end" date,
	"status" "objective_status" DEFAULT 'draft' NOT NULL,
	"owner_user_id" uuid,
	"is_client_visible" boolean DEFAULT true NOT NULL,
	"current_value" numeric(20, 4),
	"achievement_percent" integer,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "objectives_org_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_types" ADD CONSTRAINT "objective_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_objective_type_id_objective_types_id_fk" FOREIGN KEY ("objective_type_id") REFERENCES "public"."objective_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_org_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_scope_code_key" ON "metrics" USING btree (coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid),"code");--> statement-breakpoint
CREATE UNIQUE INDEX "objective_types_scope_code_key" ON "objective_types" USING btree (coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid),"code");--> statement-breakpoint
CREATE INDEX "objectives_org_project_idx" ON "objectives" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "objectives_org_metric_idx" ON "objectives" USING btree ("organization_id","metric_id");--> statement-breakpoint

-- ===========================================================================
-- Hand-written below: row level security, which is never generated.
--
-- `objectives` is a tenant table. `metrics` and `objective_types` are shared
-- taxonomies: a system row (organization_id NULL) is everyone's to read and
-- nobody's to change through the application; an organisation's own rows are
-- its own entirely. Same shape as `industries` (0007) and the action
-- taxonomies (0010).
-- ===========================================================================

ALTER TABLE objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE objectives FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON objectives FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE objective_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE objective_types FORCE ROW LEVEL SECURITY;
CREATE POLICY read_system_or_own ON objective_types FOR SELECT TO app_user
  USING (
    organization_id IS NULL
    OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );
CREATE POLICY write_own ON objective_types FOR INSERT TO app_user
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY update_own ON objective_types FOR UPDATE TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY delete_own ON objective_types FOR DELETE TO app_user
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics FORCE ROW LEVEL SECURITY;
CREATE POLICY read_system_or_own ON metrics FOR SELECT TO app_user
  USING (
    organization_id IS NULL
    OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );
CREATE POLICY write_own ON metrics FOR INSERT TO app_user
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY update_own ON metrics FOR UPDATE TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY delete_own ON metrics FOR DELETE TO app_user
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
