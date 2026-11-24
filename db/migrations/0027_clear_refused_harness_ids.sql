-- Saves before 0027_studio_session_owner stored any harness id in conversation.agent_session_id. 0027_studio_session_owner indexes that column and copies it into the studio_session_owner primary key, and a btree key over 2,704 bytes fails both. The Studio proxy refuses any id that fails isConversationId in src/lib/studio/studioAccess.ts, so this clears each such id by that rule as it stood: 1 to 256 UTF-16 code units, where a character above U+FFFF counts twice, and no character in Unicode category Cc. Postgres text cannot hold U+0000.
-- Its journal `when`, 1795470778321, sits 1 ms before 0027_studio_session_owner's, so a database that has applied that entry skips this one. drizzle-orm applies a journal entry only when its `when` is newer than the last one recorded, and runs every pending entry in one transaction. A database at 0026 runs this file, then 0027_studio_session_owner, so the lock below holds until that index is built and no save can store a refused id in between.
-- The lock takes "user" before "conversation", the order account deletion takes them through its cascade. 0027_studio_session_owner then needs no stronger lock on either. Its foreign key to "user" takes SHARE ROW EXCLUSIVE and its index on "conversation" takes SHARE. Locking "conversation" alone would let a deletion hold "user" and wait on "conversation" while 0027_studio_session_owner waits on "user", a deadlock.
-- The lock timeout covers every lock this transaction waits for. A write transaction left open on either table fails the migration after 10 s, and the deploy can run it again, where an unbounded wait would hold every save until the migration Job's 600 s timeout.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
LOCK TABLE "user", "conversation" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
UPDATE "conversation" SET "agent_session_id" = NULL
WHERE "agent_session_id" IS NOT NULL
AND (
	char_length("agent_session_id") + char_length(regexp_replace("agent_session_id", '[^\U00010000-\U0010FFFF]', '', 'g')) NOT BETWEEN 1 AND 256
	OR "agent_session_id" ~ '[\u0001-\u001F\u007F-\u009F]'
);
