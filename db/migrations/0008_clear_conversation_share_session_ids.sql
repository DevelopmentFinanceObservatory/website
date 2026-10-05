-- A conversation share used to keep the owner's harness conversation id (`sessionId`) in its stored snapshot, and the share page sent it to every viewer's browser. pruneForShare now clears it on new shares; this clears it from the rows already stored.
-- "Continue this session" and the share page fork with `sessionId: null`, so a share does not need the id.
UPDATE share
SET data = jsonb_set(data, '{sessionId}', 'null'::jsonb)
WHERE kind = 'conversation'
  AND data ->> 'sessionId' IS NOT NULL;
