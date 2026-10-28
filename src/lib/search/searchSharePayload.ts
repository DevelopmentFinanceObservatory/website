import type { ShareRecord } from '../chat/apisShares.ts';
import type { SearchShare, SearchShareRef } from './searchShare.ts';
import type { SearchSharePart } from './searchShareRequest.ts';

/**
 * A search share's payload in dfo-apis: `{query, parts}`, each part under the
 * column names of the website's `share_ref` rows (docs/share-export.md),
 * so a share made here and one imported from the website's table read back
 * alike. dfo-apis stores the payload as given and does not read it.
 *
 * No database or path-alias dependency, so `node --test` imports it.
 */

/** A stored part. `content_version` and `artifact_digest` are a snapshot's
 *  captured file, null for a live share and for a snapshot stored before
 *  digests were kept. */
type StoredPart = {
    part_index: number;
    spec_id: string;
    identity: unknown;
    entity_groups: SearchShareRef['entityGroups'];
    variable_text: string | null;
    content_version: string | null;
    artifact_digest: string | null;
    operations: SearchShareRef['operations'];
    assumptions: SearchShareRef['assumptions'];
};

export type Captured = { specId: string; contentVersion: string; artifactDigest: string };

/** The payload of a search share of `parts` in part order, each with the
 *  file a snapshot captured for it, or null for a live share. */
export const searchSharePayload = (
    query: string,
    parts: { part: SearchSharePart; captured: Captured | null }[],
): { query: string; parts: StoredPart[] } => ({
    query,
    parts: parts.map(({ part, captured }) => ({
        part_index: part.partIndex,
        spec_id: captured?.specId ?? part.specId,
        identity: part.identity,
        entity_groups: part.entityGroups ?? null,
        variable_text: part.variableText,
        content_version: captured?.contentVersion ?? null,
        artifact_digest: captured?.artifactDigest ?? null,
        operations: part.operations,
        assumptions: part.assumptions ?? null,
    })),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const refOf = (part: unknown): SearchShareRef | null => {
    if (
        !isRecord(part) ||
        !Number.isSafeInteger(part['part_index']) ||
        typeof part['spec_id'] !== 'string'
    ) {
        return null;
    }

    return {
        partIndex: part['part_index'] as number,
        variableText: textOrNull(part['variable_text']),
        specId: part['spec_id'],
        identity: part['identity'],
        entityGroups: isRecord(part['entity_groups'])
            ? (part['entity_groups'] as SearchShareRef['entityGroups'])
            : null,
        operations: Array.isArray(part['operations'])
            ? (part['operations'] as SearchShareRef['operations'])
            : [],
        assumptions: Array.isArray(part['assumptions'])
            ? (part['assumptions'] as SearchShareRef['assumptions'])
            : null,
        contentVersion: textOrNull(part['content_version']),
        artifactDigest: textOrNull(part['artifact_digest']),
    };
};

/** A search share as the search page and its download read it, or null for
 *  a share of another kind or a payload that is not a search's. */
export const searchShareOf = (record: ShareRecord): SearchShare | null => {
    const { payload } = record;

    if (record.kind !== 'search' || !isRecord(payload) || !Array.isArray(payload['parts'])) {
        return null;
    }

    const refs = payload['parts'].map(refOf);

    if (refs.some((ref) => ref === null)) {
        return null;
    }

    return {
        id: record.id,
        mode: record.mode,
        query: textOrNull(payload['query']) ?? record.title ?? '',
        createdAt: record.createdAt,
        refs: (refs as SearchShareRef[]).toSorted((a, b) => a.partIndex - b.partIndex),
    };
};
