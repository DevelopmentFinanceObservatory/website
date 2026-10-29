import assert from 'node:assert/strict';
import test from 'node:test';

import type { ShareRecord } from '../../chat/apisShares.ts';
import { searchShareOf, searchSharePayload } from '../searchSharePayload.ts';
import type { SearchSharePart } from '../searchShareRequest.ts';

const part = (partIndex: number, specId: string): SearchSharePart =>
    ({
        partIndex,
        variableText: `part ${partIndex}`,
        specId,
        identity: { variable: specId },
        entityGroups: null,
        operations: [],
        assumptions: [],
        definition: { spec_id: specId },
    }) as unknown as SearchSharePart;

const record = (payload: unknown, mode: 'live' | 'snapshot' = 'snapshot'): ShareRecord => ({
    id: 'Ab3dEf7h',
    kind: 'search',
    mode,
    title: 'aid to Kenya',
    slots: [],
    payload,
    createdAt: '2026-10-28T10:00:00Z',
});

test('a search share reads back as the search page read it from the old table', () => {
    const payload = searchSharePayload('aid to Kenya', [
        {
            part: part(0, 'spec_a'),
            captured: { specId: 'spec_a2', contentVersion: 'cv_1', artifactDigest: 'sha256:x' },
        },
        { part: part(1, 'spec_b'), captured: null },
    ]);

    // Stored under the old share_ref column names, as the export writes them.
    assert.deepEqual(payload.parts[0], {
        part_index: 0,
        spec_id: 'spec_a2',
        identity: { variable: 'spec_a' },
        entity_groups: null,
        variable_text: 'part 0',
        content_version: 'cv_1',
        artifact_digest: 'sha256:x',
        operations: [],
        assumptions: [],
    });

    assert.deepEqual(searchShareOf(record({ ...payload, parts: payload.parts.toReversed() })), {
        id: 'Ab3dEf7h',
        mode: 'snapshot',
        query: 'aid to Kenya',
        createdAt: '2026-10-28T10:00:00Z',
        refs: [
            {
                partIndex: 0,
                variableText: 'part 0',
                specId: 'spec_a2',
                identity: { variable: 'spec_a' },
                entityGroups: null,
                operations: [],
                assumptions: [],
                contentVersion: 'cv_1',
                artifactDigest: 'sha256:x',
            },
            {
                partIndex: 1,
                variableText: 'part 1',
                specId: 'spec_b',
                identity: { variable: 'spec_b' },
                entityGroups: null,
                operations: [],
                assumptions: [],
                contentVersion: null,
                artifactDigest: null,
            },
        ],
    });
});

test('a share of another kind, or a payload with no parts, is no search share', () => {
    assert.equal(searchShareOf({ ...record({ parts: [] }), kind: 'canvas' }), null);
    assert.equal(searchShareOf(record({ query: 'q' })), null);
    assert.equal(searchShareOf(record({ parts: [{ part_index: 0 }] })), null);
    // A payload with no query reads the title, as the old table's rows did.
    assert.equal(searchShareOf(record({ parts: [] }, 'live'))?.query, 'aid to Kenya');
});
