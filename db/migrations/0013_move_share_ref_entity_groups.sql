-- A share's named groups are posted to Search beside the identity, and Search refuses an identity that holds them.
-- This moves `entity_groups` out of each stored identity into the `entity_groups` column; a JSON null there becomes a SQL NULL.
UPDATE share_ref
SET entity_groups = NULLIF(identity -> 'entity_groups', 'null'::jsonb),
    identity = identity - 'entity_groups'
WHERE identity ? 'entity_groups';