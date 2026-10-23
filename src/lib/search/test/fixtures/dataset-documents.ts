/**
 * Datasets API document parts, built to the generated wire types so a test names only the members
 * it reads.
 */

import type { ArtifactEntryModel, DefinitionModel } from '@developmentfinance/client/wire';

/** One listed file; `url` and `artifact_digest` default from the digest. */
export const artifact = ({
    artifact_digest = 'sha256:test',
    ...rest
}: Pick<ArtifactEntryModel, 'rendering'> & Partial<ArtifactEntryModel>): ArtifactEntryModel => ({
    artifact_digest,
    bytes: 1,
    media_type: 'text/csv',
    created_at: '2026-10-01T00:00:00Z',
    tier: 'working',
    url: `/api/datasets/spec_a1/cv_b2/files/${artifact_digest}`,
    ...rest,
});

/** A definition holding `identity` under `spec_id`. */
export const definition = (
    identity: DefinitionModel['identity'],
    spec_id = 'spec_a1',
): DefinitionModel => ({ schema_version: 1, spec_id, identity });
