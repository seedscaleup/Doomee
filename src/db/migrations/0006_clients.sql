CREATE TYPE "public"."client_status" AS ENUM('prospect', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('client', 'project', 'action', 'objective', 'deliverable', 'result', 'insight', 'report', 'risk', 'meeting', 'milestone');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('internal', 'shared');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"verb" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" "visibility" DEFAULT 'internal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"phone" text,
	"job_title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "client_contacts_client_email_key" UNIQUE("organization_id","client_id","email")
);
--> statement-breakpoint
CREATE TABLE "client_user_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_user_access_key" UNIQUE("organization_id","user_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"industry_id" uuid,
	"description" text,
	"website" text,
	"email" "citext",
	"phone" text,
	"address" text,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"owner_user_id" uuid,
	"account_team_note" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "clients_org_slug_key" UNIQUE("organization_id","slug"),
	CONSTRAINT "clients_org_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"code" text NOT NULL,
	"labels" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_org_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_user_access" ADD CONSTRAINT "client_user_access_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_user_access" ADD CONSTRAINT "client_user_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_user_access" ADD CONSTRAINT "client_user_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_user_access" ADD CONSTRAINT "client_user_access_org_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industries" ADD CONSTRAINT "industries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_org_client_idx" ON "activity_events" USING btree ("organization_id","client_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_events_org_project_idx" ON "activity_events" USING btree ("organization_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_events_org_entity_idx" ON "activity_events" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "client_contacts_org_client_idx" ON "client_contacts" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE INDEX "client_user_access_user_idx" ON "client_user_access" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "clients_org_status_idx" ON "clients" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "clients_org_name_idx" ON "clients" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "industries_scope_code_key" ON "industries" USING btree (coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid),"code");