CREATE TABLE "studio_session_owner" (
	"agent_session_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_session_owner" ADD CONSTRAINT "studio_session_owner_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Each harness conversation a saved conversation names goes to the account whose row naming it was created first, the earliest save on record.
INSERT INTO "studio_session_owner" ("agent_session_id", "user_id", "created_at")
SELECT DISTINCT ON ("agent_session_id") "agent_session_id", "user_id", "created_at"
FROM "conversation"
WHERE "agent_session_id" IS NOT NULL
ORDER BY "agent_session_id", "created_at", "id";
