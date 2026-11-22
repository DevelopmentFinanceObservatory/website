-- One row per saved conversation that has a user: its id, the agent's
-- session id, the user id and the creation time. The view runs with the
-- migrator's rights, its owner's, so `website_export_reader` reads these four
-- columns and not the transcript, title or widgets in `conversation.data`.
-- The event export Job (db/export-events.ts) digests the user id under
-- EXPORT_ID_HMAC_KEY, as it digests the user id of every event, and writes
-- only the digest to BigQuery.
CREATE VIEW "conversation_export" AS
SELECT "id", "agent_session_id", "user_id", "created_at"
FROM "conversation"
WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
GRANT SELECT ON "conversation_export" TO website_export_reader;
