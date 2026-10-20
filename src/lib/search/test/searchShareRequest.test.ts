import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeResponse } from '../searchClient.ts';
import {
    readSearchShareRequest,
    SEARCH_SHARE_MAX_PARTS,
    searchSharePart,
} from '../searchShareRequest.ts';
import type { HydratedPart, Spec } from '../types.ts';
import { fixtures } from './fixtures/index.ts';

const part = (partIndex: number) => ({
    partIndex,
    variableText: null,
    specId: `spec_${partIndex}a`,
    identity: {},
    operations: [],
    definition: {},
});

const body = (partCount: number, mode: string = 'live') => ({
    mode,
    query: ' gdp ',
    parts: Array.from({ length: partCount }, (_, index) => part(index)),
});

for (const mode of ['live', 'snapshot']) {
    test(`a ${mode} share of ${SEARCH_SHARE_MAX_PARTS} parts reads, with the query trimmed`, () => {
        const request = readSearchShareRequest(body(SEARCH_SHARE_MAX_PARTS, mode));

        assert.equal(request?.mode, mode);
        assert.equal(request?.query, 'gdp');
        assert.equal(request?.parts.length, SEARCH_SHARE_MAX_PARTS);
    });

    test(`a ${mode} share over the cap is refused`, () => {
        assert.equal(readSearchShareRequest(body(SEARCH_SHARE_MAX_PARTS + 1, mode)), null);
    });
}

test("a part reads with its Spec's groups, with null and with none, and an array of groups is refused", () => {
    const withGroups = (entityGroups: unknown) => ({
        ...body(1),
        parts: [{ ...part(0), entityGroups }],
    });
    const groups = { origin: { ref: 'EuropeanUnion', label: 'EU member states' } };
    const region = {
        observationAbout: { ref: 'africa', label: 'Africa', entity_type: 'Continent' },
    };

    assert.deepEqual(readSearchShareRequest(withGroups(groups))?.parts[0].entityGroups, groups);
    assert.deepEqual(readSearchShareRequest(withGroups(region))?.parts[0].entityGroups, region);
    assert.equal(readSearchShareRequest(withGroups(null))?.parts[0].entityGroups, null);
    assert.equal(readSearchShareRequest(body(1))?.parts.length, 1);
    assert.equal(readSearchShareRequest(withGroups([groups])), null);
    assert.equal(readSearchShareRequest(withGroups('EuropeanUnion')), null);
});

test("a part's groups hold role keys only, each a label of 1 to 120 characters and an optional ref, entity type and total", () => {
    const withGroups = (entityGroups: unknown) => ({
        ...body(1),
        parts: [{ ...part(0), entityGroups }],
    });
    const reads = (entityGroups: unknown) =>
        readSearchShareRequest(withGroups(entityGroups)) !== null;

    assert.equal(reads({ origin: { label: 'G7 countries' } }), true);
    assert.equal(reads({ origin: { ref: null, label: 'G7 countries' } }), true);
    assert.equal(reads({ origin: { label: 'Africa', entity_type: 'Continent' } }), true);
    assert.equal(reads({ origin: { label: 'G7 countries', entity_type: null } }), true);
    assert.equal(reads({ origin: { ref: 'africa', label: 'Africa', total: 'DACAfrica' } }), true);
    assert.equal(
        reads({
            observationAbout: { label: 'x'.repeat(120) },
            origin: { ref: 'd'.repeat(1024), label: 'EU', entity_type: 't'.repeat(1024) },
            destination: { label: 'LDCs' },
        }),
        true,
    );

    assert.equal(reads({ donor: { label: 'G7 countries' } }), false);
    assert.equal(reads({ origin: 'EuropeanUnion' }), false);
    assert.equal(reads({ origin: null }), false);
    assert.equal(reads({ origin: { ref: 'EuropeanUnion' } }), false);
    assert.equal(reads({ origin: { dcid: 'EuropeanUnion', label: 'EU' } }), false);
    assert.equal(reads({ origin: { label: '' } }), false);
    assert.equal(reads({ origin: { label: 27 } }), false);
    assert.equal(reads({ origin: { label: 'x'.repeat(121) } }), false);
    assert.equal(reads({ origin: { ref: 27, label: 'EU' } }), false);
    assert.equal(reads({ origin: { ref: 'd'.repeat(1025), label: 'EU' } }), false);
    assert.equal(reads({ origin: { label: 'EU', entity_type: 27 } }), false);
    assert.equal(reads({ origin: { label: 'EU', entity_type: 't'.repeat(1025) } }), false);
    assert.equal(reads({ origin: { label: 'Africa', total: 'd'.repeat(1025) } }), false);
    assert.equal(reads({ origin: { label: 'EU', members: ['country/DEU'] } }), false);
});

test('a part reads with its assumptions, [] and null included, and a malformed one is refused', () => {
    const reads = (assumptions: unknown) =>
        readSearchShareRequest({ ...body(1), parts: [{ ...part(0), assumptions }] })?.parts[0];
    const oda = {
        kind: 'declared_default',
        binding_ref: 'how:flowType',
        refs: ['ODA'],
        text: 'official development assistance',
    };
    const scope = { kind: 'place_scope', binding_ref: 'where:', refs: [], text: 'every country' };

    assert.deepEqual(reads([oda, scope])?.assumptions, [oda, scope]);
    assert.deepEqual(reads([])?.assumptions, []);
    assert.equal(reads(null)?.assumptions, null);
    assert.ok(reads(undefined));

    for (const malformed of [
        oda,
        [{ ...oda, kind: 'guess' }],
        [{ ...oda, refs: [27] }],
        [{ ...oda, text: null }],
        [{ ...oda, note: 'extra' }],
    ]) {
        assert.equal(reads(malformed), undefined, JSON.stringify(malformed));
    }
});

test('a part whose identity holds entity_groups is refused', () => {
    const withIdentity = (identity: unknown) => ({
        ...body(1),
        parts: [{ ...part(0), identity }],
    });

    assert.equal(readSearchShareRequest(withIdentity({ entities: {} }))?.parts.length, 1);
    assert.equal(
        readSearchShareRequest(withIdentity({ entity_groups: { origin: { label: 'EU' } } })),
        null,
    );
    assert.equal(readSearchShareRequest(withIdentity({ entity_groups: null })), null);
});

test("a definite part shares its Spec's groups beside the identity, and null when it has none", () => {
    const [response] = normalizeResponse(fixtures['definite-rank-operation']).parts;
    const hydrated: HydratedPart = {
        index: 0,
        variableText: response.variable_text ?? null,
        part: response,
        hydratedSpec: response.spec!,
        observationsPending: false,
        phase: 'done',
        editError: null,
    };
    const groups = { origin: { ref: 'EuropeanUnion', label: 'EU member states' } };
    const shared = searchSharePart({
        ...hydrated,
        hydratedSpec: { ...hydrated.hydratedSpec!, entity_groups: groups },
    });

    const spec = response.spec as Spec & { definition: unknown };

    assert.ok(spec.definition && response.operations?.length);
    assert.deepEqual(shared, {
        partIndex: 0,
        variableText: response.variable_text,
        specId: spec.spec_id,
        identity: spec.identity,
        entityGroups: groups,
        operations: response.operations,
        assumptions: response.assumptions ?? null,
        definition: spec.definition,
    });
    assert.equal(
        searchSharePart({
            ...hydrated,
            hydratedSpec: { ...hydrated.hydratedSpec!, entity_groups: undefined },
        }).entityGroups,
        null,
    );
    assert.ok(readSearchShareRequest({ mode: 'live', query: 'aid', parts: [shared] }));
});

test('an unknown mode, an empty query or no parts is refused', () => {
    assert.equal(readSearchShareRequest(body(1, 'draft')), null);
    assert.equal(readSearchShareRequest({ ...body(1), query: '  ' }), null);
    assert.equal(readSearchShareRequest(body(0)), null);
});
