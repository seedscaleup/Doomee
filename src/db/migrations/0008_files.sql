CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum" text,
	"uploaded_by" uuid,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "files_org_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "logo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_org_created_idx" ON "files" USING btree ("organization_id","created_at");--> statement-breakpoint

-- ===========================================================================
-- Hand-written below: the composite foreign key drizzle cannot express without
-- a circular import, and row level security, which is never generated.
-- ===========================================================================

-- A client's logo belongs to the client's own organisation. The composite key
-- is what makes that true in the database rather than in a code review.
ALTER TABLE clients
  ADD CONSTRAINT clients_org_logo_file_fk
  FOREIGN KEY (organization_id, logo_file_id)
  REFERENCES files (organization_id, id) ON DELETE SET NULL;

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON files FOR ALL TO app_user
  USING      (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
