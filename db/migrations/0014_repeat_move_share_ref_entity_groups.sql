-- Reaches the rows whose stored identity holds `entity_groups`, and removes the member from the identity.
-- A filled `entity_groups` column keeps its value; an empty one takes the identity's, where a JSON null stays a SQL NULL.
UPDATE share_ref
SET entity_groups = COALESCE(entity_groups, NULLIF(identity -> 'entity_groups', 'null'::jsonb)),
    identity = identity - 'entity_groups'
WHERE identity ? 'entity_groups';