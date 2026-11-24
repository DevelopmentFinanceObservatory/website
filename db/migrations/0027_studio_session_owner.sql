CREATE TABLE "studio_session_owner" (
	"agent_session_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_session_owner" ADD CONSTRAINT "studio_session_owner_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_session_owner_user_idx" ON "studio_session_owner" USING btree ("user_id");--> statement-breakpoint
-- Saves before this migration stored any harness id. The Studio proxy refuses an id that fails isConversationId in src/lib/studio/studioAccess.ts, so such an id names no usable conversation, and one over about 2.7 KB fails the index below and the owner key. This clears each one by that rule: 1 to 256 UTF-16 code units, where a character above U+FFFF counts twice, and no character in Unicode category Cc. Postgres text cannot hold U+0000.
UPDATE "conversation" SET "agent_session_id" = NULL
WHERE "agent_session_id" IS NOT NULL
AND (
	char_length("agent_session_id") + char_length(regexp_replace("agent_session_id", '[^\U00010000-\U0010FFFF]', '', 'g')) NOT BETWEEN 1 AND 256
	OR "agent_session_id" ~ '[\u0001-\u001F\u007F-\u009F]'
);--> statement-breakpoint
CREATE INDEX "conversation_agent_session_idx" ON "conversation" USING btree ("agent_session_id");--> statement-breakpoint
-- A harness conversation goes to the account behind the oldest saved conversation naming it, ordered by created_at, then id, the rule claimFromSaves in src/lib/chat/conversationSave.ts applies to saves written since.
INSERT INTO "studio_session_owner" ("agent_session_id", "user_id")
SELECT DISTINCT ON ("agent_session_id") "agent_session_id", "user_id"
FROM "conversation"
WHERE "agent_session_id" IS NOT NULL
ORDER BY "agent_session_id", "created_at", "id";
