CREATE TYPE "public"."field_kind" AS ENUM('number', 'percent', 'currency', 'text', 'longtext', 'url', 'date', 'select', 'boolean');--> statement-breakpoint
CREATE TYPE "public"."result_note_kind" AS ENUM('observation', 'audience_feedback', 'client_feedback', 'difficulty', 'positive', 'negative', 'learning', 'opportunity');--> statement-breakpoint
CREATE TABLE "result_form_fields" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"template_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" "field_kind" NOT NULL,
	"labels" jsonb NOT NULL,
	"help" jsonb,
	"metric_id" uuid,
	"unit" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"options" jsonb,
	"default_value" text,
	"min" numeric(20, 4),
	"max" numeric(20, 4),
	CONSTRAINT "result_form_fields_template_key" UNIQUE("template_id","key")
);
--> statement-breakpoint
CREATE TABLE "result_form_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"action_type_id" uuid,
	"code" text NOT NULL,
	"labels" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"unit" text,
	"currency" char(3),
	"objective_id" uuid,
	"project_id" uuid,
	"client_id" uuid,
	"channel_id" uuid,
	"action_type_id" uuid,
	"recorded_for" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_metrics_result_field_key" UNIQUE("organization_id","result_id","field_key")
);
--> statement-breakpoint
CREATE TABLE "result_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"kind" "result_note_kind" NOT NULL,
	"body" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"action_id" uuid,
	"objective_id" uuid,
	"template_id" uuid,
	"title" text,
	"recorded_for" date NOT NULL,
	"period_start" date,
	"period_end" date,
	"analysis" text,
	"recommendation" text,
	"recorded_by" uuid,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "results_org_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "result_form_fields" ADD CONSTRAINT "result_form_fields_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_form_fields" ADD CONSTRAINT "result_form_fields_template_id_result_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."result_form_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_form_fields" ADD CONSTRAINT "result_form_fields_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_form_templates" ADD CONSTRAINT "result_form_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_form_templates" ADD CONSTRAINT "result_form_templates_action_type_id_action_types_id_fk" FOREIGN KEY ("action_type_id") REFERENCES "public"."action_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_metrics" ADD CONSTRAINT "result_metrics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_metrics" ADD CONSTRAINT "result_metrics_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_metrics" ADD CONSTRAINT "result_metrics_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_metrics" ADD CONSTRAINT "result_metrics_action_type_id_action_types_id_fk" FOREIGN KEY ("action_type_id") REFERENCES "public"."action_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_metrics" ADD CONSTRAINT "result_metrics_org_result_fk" FOREIGN KEY ("organization_id","result_id") REFERENCES "public"."results"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_metrics" ADD CONSTRAINT "result_metrics_org_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_metrics" ADD CONSTRAINT "result_metrics_org_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_metrics" ADD CONSTRAINT "result_metrics_org_objective_fk" FOREIGN KEY ("organization_id","objective_id") REFERENCES "public"."objectives"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_notes" ADD CONSTRAINT "result_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_notes" ADD CONSTRAINT "result_notes_org_result_fk" FOREIGN KEY ("organization_id","result_id") REFERENCES "public"."results"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_template_id_result_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."result_form_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_org_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_org_action_fk" FOREIGN KEY ("organization_id","action_id") REFERENCES "public"."actions"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_org_objective_fk" FOREIGN KEY ("organization_id","objective_id") REFERENCES "public"."objectives"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "result_form_fields_template_idx" ON "result_form_fields" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "result_form_templates_scope_key" ON "result_form_templates" USING btree (coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("action_type_id", '00000000-0000-0000-0000-000000000000'::uuid),"version");--> statement-breakpoint
CREATE INDEX "result_metrics_org_metric_date_idx" ON "result_metrics" USING btree ("organization_id","metric_id","recorded_for");--> statement-breakpoint
CREATE INDEX "result_metrics_org_project_metric_idx" ON "result_metrics" USING btree ("organization_id","project_id","metric_id");--> statement-breakpoint
CREATE INDEX "result_metrics_org_client_metric_idx" ON "result_metrics" USING btree ("organization_id","client_id","metric_id","recorded_for");--> statement-breakpoint
CREATE INDEX "result_notes_org_result_idx" ON "result_notes" USING btree ("organization_id","result_id","sort_order");--> statement-breakpoint
CREATE INDEX "results_org_project_recorded_idx" ON "results" USING btree ("organization_id","project_id","recorded_for");--> statement-breakpoint
CREATE INDEX "results_org_recorded_idx" ON "results" USING btree ("organization_id","recorded_for");--> statement-breakpoint

-- ===========================================================================
-- Hand-written below: row level security, and the append-only posture of
-- result_metrics.
-- ===========================================================================

ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE results FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON results FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE result_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_metrics FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON result_metrics FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE result_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON result_notes FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- The smart-form catalogue: a shared reference table, like `industries`.
-- A system row belongs to everyone in reading and to nobody in writing.
-- ---------------------------------------------------------------------------
ALTER TABLE result_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_form_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY read_system_or_own ON result_form_templates FOR SELECT TO app_user
  USING (
    organization_id IS NULL
    OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );
CREATE POLICY write_own ON result_form_templates FOR INSERT TO app_user
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY update_own ON result_form_templates FOR UPDATE TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY delete_own ON result_form_templates FOR DELETE TO app_user
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE result_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_form_fields FORCE ROW LEVEL SECURITY;
CREATE POLICY read_system_or_own ON result_form_fields FOR SELECT TO app_user
  USING (
    organization_id IS NULL
    OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );
CREATE POLICY write_own ON result_form_fields FOR INSERT TO app_user
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY update_own ON result_form_fields FOR UPDATE TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY delete_own ON result_form_fields FOR DELETE TO app_user
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- result_metrics is APPEND-ONLY for UPDATE (ADR-022).
--
-- A measurement is an observation of a moment: correcting one means recording
-- the correction, not rewriting it. DELETE stays available — editing or
-- withdrawing a result replaces its metric rows inside one transaction, and a
-- withdrawn result must stop being counted.
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON result_metrics FROM app_user;
