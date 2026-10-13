-- Search names a group's graph node `ref`, and refuses a group posted with `dcid`.
-- This renames `dcid` to `ref` in each stored group that holds `dcid` and no `ref`, and leaves every other group and row as it was.
UPDATE share_ref
SET entity_groups = (
    SELECT jsonb_object_agg(
        groups.role,
        CASE
            WHEN jsonb_typeof(groups.grp) = 'object' AND groups.grp ? 'dcid' AND NOT groups.grp ? 'ref'
            THEN (groups.grp - 'dcid') || jsonb_build_object('ref', groups.grp -> 'dcid')
            ELSE groups.grp
        END
    )
    FROM jsonb_each(share_ref.entity_groups) AS groups(role, grp)
)
WHERE jsonb_typeof(entity_groups) = 'object'
    AND EXISTS (
        SELECT 1
        FROM jsonb_each(share_ref.entity_groups) AS groups(role, grp)
        WHERE jsonb_typeof(groups.grp) = 'object' AND groups.grp ? 'dcid' AND NOT groups.grp ? 'ref'
    );
