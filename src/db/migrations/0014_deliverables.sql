CREATE TYPE "public"."deliverable_status" AS ENUM('draft', 'production', 'internal_review', 'client_review', 'changes_requested', 'approved', 'published');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."review_scope" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TABLE "deliverable_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"scope" "review_scope" NOT NULL,
	"decision" "review_decision" NOT NULL,
	"comment" text,
	"reviewer_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"code" text NOT NULL,
	"labels" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"file_id" uuid,
	"external_url" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverable_versions_org_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "deliverable_versions_number_key" UNIQUE("organization_id","deliverable_id","version")
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"action_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"deliverable_type_id" uuid,
	"status" "deliverable_status" DEFAULT 'draft' NOT NULL,
	"owner_user_id" uuid,
	"current_version_id" uuid,
	"due_date" date,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"sent_to_client_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"published_at" timestamp with time zone,
	"external_url" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "deliverables_org_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_org_deliverable_fk" FOREIGN KEY ("organization_id","deliverable_id") REFERENCES "public"."deliverables"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_org_version_fk" FOREIGN KEY ("organization_id","version_id") REFERENCES "public"."deliverable_versions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_types" ADD CONSTRAINT "deliverable_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_org_deliverable_fk" FOREIGN KEY ("organization_id","deliverable_id") REFERENCES "public"."deliverables"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_org_file_fk" FOREIGN KEY ("organization_id","file_id") REFERENCES "public"."files"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_deliverable_type_id_deliverable_types_id_fk" FOREIGN KEY ("deliverable_type_id") REFERENCES "public"."deliverable_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_org_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliverable_reviews_org_deliverable_idx" ON "deliverable_reviews" USING btree ("organization_id","deliverable_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_types_scope_code_key" ON "deliverable_types" USING btree (coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid),"code");--> statement-breakpoint
CREATE INDEX "deliverables_org_project_idx" ON "deliverables" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "deliverables_org_status_idx" ON "deliverables" USING btree ("organization_id","status","due_date");--> statement-breakpoint

-- ===========================================================================
-- ROW LEVEL SECURITY — written by hand, because generated migrations do not
-- write security (CLAUDE.md §7).
--
-- Every applicative table: ENABLE *and* FORCE. FORCE matters — without it the
-- table owner bypasses its own policies, and the migrator owns every table.
-- ===========================================================================

ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deliverables FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE deliverable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deliverable_versions FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE deliverable_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deliverable_reviews FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- deliverable_types is a shared reference table, like `industries`.
-- A system row (organization_id IS NULL) belongs to everyone in reading and to
-- nobody in writing.
-- ---------------------------------------------------------------------------
ALTER TABLE deliverable_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_types FORCE ROW LEVEL SECURITY;
CREATE POLICY read_system_or_own ON deliverable_types FOR SELECT TO app_user
  USING (
    organization_id IS NULL
    OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );
CREATE POLICY write_own ON deliverable_types FOR INSERT TO app_user
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY update_own ON deliverable_types FOR UPDATE TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY delete_own ON deliverable_types FOR DELETE TO app_user
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- A review is a DECISION that was made. It does not get rewritten afterwards:
-- "the client approved version 3 on the 14th" has to stay true, or the audit
-- trail of the validation cycle is worth nothing.
--
-- DELETE stays available so that deleting a deliverable takes its history with
-- it; UPDATE does not.
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON deliverable_reviews FROM app_user;

-- A version is the same kind of fact: version 2 is whatever was uploaded as
-- version 2. Correcting it means uploading version 3.
REVOKE UPDATE ON deliverable_versions FROM app_user;
