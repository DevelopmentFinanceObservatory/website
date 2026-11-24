-- Saves before 0027_studio_session_owner stored any harness id in conversation.agent_session_id. 0027_studio_session_owner indexes that column and copies it into the studio_session_owner primary key, and a btree key over 2,704 bytes fails both. The Studio proxy refuses any id that fails isConversationId in src/lib/studio/studioAccess.ts, so this clears each such id by that rule as it stood: 1 to 256 UTF-16 code units, where a character above U+FFFF counts twice, and no character in Unicode category Cc. Postgres text cannot hold U+0000.
-- Its journal `when`, 1795470778321, is one millisecond before 0027_studio_session_owner's, because the dev database applied 0027_studio_session_owner before this file existed. drizzle-orm applies a journal entry only when its `when` is newer than the last one recorded, and runs every pending entry in one transaction. A database at 0026 runs this file, then 0027_studio_session_owner, so the lock below holds until that index is built and no save can store a refused id in between. A database that has applied 0027_studio_session_owner skips this file.
-- The lock takes "user" before "conversation", the order account deletion takes them through its cascade, and 0027_studio_session_owner then needs no stronger lock on either: its foreign key to "user" takes SHARE ROW EXCLUSIVE and its index on "conversation" takes SHARE. Locking "conversation" alone would let a deletion hold "user" and wait on "conversation" while 0027_studio_session_owner waits on "user", a deadlock.
LOCK TABLE "user", "conversation" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
UPDATE "conversation" SET "agent_session_id" = NULL
WHERE "agent_session_id" IS NOT NULL
AND (
	char_length("agent_session_id") + char_length(regexp_replace("agent_session_id", '[^\U00010000-\U0010FFFF]', '', 'g')) NOT BETWEEN 1 AND 256
	OR "agent_session_id" ~ '[\u0001-\u001F\u007F-\u009F]'
);
