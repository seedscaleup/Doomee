CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limits_key_idx" ON "rate_limits" USING btree ("key");--> statement-breakpoint
-- Identity-adjacent and tenant-less, like sessions and accounts: the
-- application role has no business reading or writing rate-limit counters.
REVOKE ALL ON rate_limits FROM app_user;
