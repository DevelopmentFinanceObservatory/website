-- One row per saved conversation of an account not being deleted
-- (`deleting_at` unset, migration 0023), as `account_daily` and
-- `account_organisation` count accounts: its id, the agent's
-- session id, the user id and the creation time. The view runs with the
-- migrator's rights, its owner's, so `website_export_reader` reads these four
-- columns and not the transcript, title or widgets in `conversation.data`.
-- The event export Job (db/export-events.ts) digests the user id under
-- EXPORT_ID_HMAC_KEY, as it digests the user id of every event, and writes
-- only the digest to BigQuery.
CREATE VIEW "conversation_export" AS
SELECT c."id", c."agent_session_id", c."user_id", c."created_at"
FROM "conversation" c
JOIN "user" u ON u."id" = c."user_id"
WHERE u."deleting_at" IS NULL;
--> statement-breakpoint
GRANT SELECT ON "conversation_export" TO website_export_reader;
