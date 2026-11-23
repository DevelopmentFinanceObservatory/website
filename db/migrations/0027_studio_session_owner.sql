CREATE TABLE "studio_session_owner" (
	"agent_session_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_session_owner" ADD CONSTRAINT "studio_session_owner_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_session_owner_user_idx" ON "studio_session_owner" USING btree ("user_id");--> statement-breakpoint
-- A harness conversation goes to the account behind the saved conversations naming it when they all belong to one account, the rule claimFromSaves in src/lib/chat/conversationSave.ts applies on read. One named by two accounts' saves stays without an owner.
INSERT INTO "studio_session_owner" ("agent_session_id", "user_id")
SELECT "agent_session_id", min("user_id")
FROM "conversation"
WHERE "agent_session_id" IS NOT NULL
GROUP BY "agent_session_id"
HAVING count(DISTINCT "user_id") = 1;
