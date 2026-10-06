/* eslint-disable @typescript-eslint/no-explicit-any -- reads the flat page Spec, typed shallowly */
import assert from 'node:assert/strict';
import test from 'node:test';

import { fitsProps, MAX_PROPS_BYTES } from '../../events/limits.ts';
import { searchEventProps } from '../searchEvents.ts';
import type { HydratedPart } from '../types.ts';

// "ODA from France to Kenya" against the dev API elects 308 CRS StatVars;
// "to all recipients" resolves some 200 places.
const entities = Array.from({ length: 204 }, (_, i) => ({
    dcid: `country/C${String(i).padStart(2, '0')}`,
    label: `Country ${i}`,
}));

const aidPart = {
    index: 0,
    variableText: 'ODA',
    part: { status: 'definite' },
    hydratedSpec: {
        spec_id: 'spec_12b8fa627fefe6caea4a9140085c6d0f',
        identity: {
            identity_version: 'spec1',
            shape: {
                kind: 'statvar_schema',
                population_type: 'FinancialFlow',
                measured_property: 'amount',
                stat_type: 'measuredValue',
                measurement_qualifier: 'Nominal',
            },
            slots: [
                { property: 'crsPurpose', binding: { state: 'unbound' } },
                { property: 'crsTypeOfFlow', binding: { state: 'value', ref: 'CRSTypeOfFlow10' } },
                { property: 'nettingBasis', binding: { state: 'set', refs: ['Gross', 'Net'] } },
            ],
            entities: { origin: ['country/FRA'] },
            requested_window: { kind: 'all' },
        },
        stat_vars: { member_count: 308, member_count_exact: true, served_count: 308 },
        resolution: {
            resolved_entities: entities,
            resolved_sources: [{ dcid: 'dc/base/OECD_CRS', label: 'OECD CRS' }],
        },
    },
} as unknown as HydratedPart;

const refusedPart = {
    index: 1,
    variableText: 'happiness',
    part: { status: 'no_data', no_data: { reason: 'no_statvar', entity_terms: ['Kenya'] } },
    hydratedSpec: null,
} as unknown as HydratedPart;

test('a run over hundreds of StatVars and places fits the intake cap, as counts', () => {
    const props = searchEventProps({
        query: 'ODA from France to all recipients',
        edited: false,
        kind: 'resolution',
        reason: null,
        parts: [aidPart, refusedPart],
    });

    assert.ok(JSON.stringify(props).length <= MAX_PROPS_BYTES);
    assert.deepEqual(props.resolved, [
        {
            specId: 'spec_12b8fa627fefe6caea4a9140085c6d0f',
            measure: {
                kind: 'statvar_schema',
                population_type: 'FinancialFlow',
                measured_property: 'amount',
                stat_type: 'measuredValue',
                measurement_qualifier: 'Nominal',
            },
            filters: { crsTypeOfFlow: 'CRSTypeOfFlow10', nettingBasis: ['Gross', 'Net'] },
            entities: { origin: { group: null, sample: ['country/FRA'], count: 1 } },
            window: { kind: 'all' },
            facets: {},
            statVarCount: 308,
            entityCount: 204,
            sources: ['dc/base/OECD_CRS'],
            sourceCount: 1,
        },
    ]);
    assert.deepEqual(props.refused, [
        {
            variableText: 'happiness',
            status: 'no_data',
            reason: 'no_statvar',
            entityTerms: ['Kenya'],
        },
    ]);
});

const withSources = (part: HydratedPart, count: number, length = 10): HydratedPart => {
    const spec = part.hydratedSpec as any;

    return {
        ...part,
        hydratedSpec: {
            ...spec,
            resolution: {
                ...spec.resolution,
                resolved_sources: Array.from({ length: count }, (_, at) => ({
                    dcid: `provenance/${String(at).padStart(length, 's')}`,
                })),
            },
        },
    } as HydratedPart;
};

const eventFor = (parts: HydratedPart[]) =>
    searchEventProps({ query: 'q', edited: false, kind: 'resolution', reason: null, parts });

test('every source id is recorded while the event fits the cap', () => {
    const [resolved] = eventFor([withSources(aidPart, 10)]).resolved;

    assert.equal(resolved.sources?.length, 10);
    assert.equal(resolved.sourceCount, 10);
    assert.equal(eventFor([withSources(aidPart, 10)]).truncated, undefined);
});

test('source ids fall back to a sample of three per part when the event would pass the cap', () => {
    const parts = Array.from({ length: 6 }, (_, index) => ({
        ...withSources(aidPart, 10, 140),
        index,
    })) as HydratedPart[];
    const props = eventFor(parts);

    assert.ok(JSON.stringify(props).length <= MAX_PROPS_BYTES);

    for (const resolved of props.resolved) {
        assert.equal(resolved.sources?.length, 3);
        assert.equal(resolved.sourceCount, 10);
    }
});

test('a group question records the group, three members and the exact count', () => {
    const members = Array.from({ length: 193 }, (_, at) => `country/C${at}`);
    const spec = aidPart.hydratedSpec as any;
    const [resolved] = eventFor([
        {
            ...aidPart,
            hydratedSpec: {
                ...spec,
                identity: {
                    ...spec.identity,
                    slots: [
                        ...spec.identity.slots,
                        { property: 'sector', binding: { state: 'set', refs: ['a', 'b', 'c'] } },
                        {
                            property: 'purpose',
                            binding: { state: 'set', refs: ['a', 'b', 'c', 'd', 'e'] },
                        },
                    ],
                    entities: { origin: ['country/FRA'], destination: members },
                    entity_groups: { destination: { dcid: 'grp/UN', label: 'UN members' } },
                },
            },
        } as HydratedPart,
    ]).resolved;

    assert.deepEqual(resolved.entities?.destination, {
        group: { dcid: 'grp/UN', label: 'UN members' },
        sample: members.slice(0, 3),
        count: 193,
    });
    assert.equal(resolved.entities?.origin.group, null);
    // A slot of up to three refs stays plain; a longer one is a sample and its count.
    assert.deepEqual(resolved.filters?.sector, ['a', 'b', 'c']);
    assert.deepEqual(resolved.filters?.purpose, { sample: ['a', 'b', 'c'], count: 5 });
});

test('an event too wide for sampled detail drops to the minimal form and fits the cap', () => {
    const spec = aidPart.hydratedSpec as any;
    const wide = (index: number) =>
        ({
            ...withSources(aidPart, 10, 140),
            index,
            hydratedSpec: {
                ...withSources(aidPart, 10, 140).hydratedSpec,
                identity: {
                    ...spec.identity,
                    slots: Array.from({ length: 20 }, (_, slot) => ({
                        property: `slot${slot}`,
                        binding: {
                            state: 'set',
                            refs: Array.from({ length: 50 }, (_, at) => `${'r'.repeat(140)}${at}`),
                        },
                    })),
                },
            },
        }) as HydratedPart;
    const props = eventFor(Array.from({ length: 6 }, (_, index) => wide(index)));

    assert.ok(JSON.stringify(props).length <= MAX_PROPS_BYTES);
    assert.equal(props.truncated, true);
    assert.equal(props.resolved.length, 6);
    assert.equal(props.resolved[0].statVarCount, 308);
    assert.equal(props.resolved[0].sourceCount, 10);
    assert.equal(props.resolved[0].sources, undefined);
    assert.equal(props.resolved[0].filters, undefined);
    assert.deepEqual(props.resolved[0].entities, { origin: { count: 1 } });
    assert.deepEqual(props.resolved[0].measure, (aidPart.hydratedSpec as any).identity.shape);
});

test('a clip never ends on half of a surrogate pair', () => {
    const clipped = searchEventProps({
        query: `${'a'.repeat(499)}\u{1F600}`,
        edited: false,
        kind: 'resolution',
        reason: null,
        parts: [aidPart],
    }).query;

    assert.equal(clipped, 'a'.repeat(499));
});

test('seeds counted in the fit drop the event to the minimal form when one source per part leaves nothing to sample', () => {
    // One source per part, the first one tuned so the event, before `seeds`,
    // sits at MAX_PROPS_BYTES - 9; `,"seeds":2` adds 10.
    const build = (length: number, seeds?: number) =>
        searchEventProps({
            query: 'q',
            edited: false,
            kind: 'resolution',
            reason: null,
            parts: Array.from({ length: 6 }, (_, index) => ({
                ...withSources(aidPart, 1, index === 0 ? length : 600),
                index,
            })) as HydratedPart[],
            seeds,
        });
    const length = Array.from({ length: 3000 }, (_, at) => at + 1).find(
        (at) => JSON.stringify(build(at)).length === MAX_PROPS_BYTES - 9,
    );

    assert.ok(length);
    assert.equal(build(length).truncated, undefined);
    assert.equal(fitsProps({ ...build(length), seeds: 2 }), false);

    const props = build(length, 2);

    assert.ok(fitsProps(props));
    assert.equal(props.seeds, 2);
});

test('refused parts of control characters end on the floor: no free text, fixed size', () => {
    const control = '\u0000'.repeat(100);
    const refused = (index: number) =>
        ({
            index,
            variableText: control,
            part: {
                status: 'no_data',
                no_data: { reason: 'no_statvar', entity_terms: [control, control, control] },
            },
            hydratedSpec: null,
        }) as unknown as HydratedPart;
    const props = searchEventProps({
        query: '\u0000'.repeat(500),
        edited: false,
        kind: 'resolution',
        reason: null,
        parts: Array.from({ length: 6 }, (_, index) => refused(index)),
    });

    assert.ok(fitsProps(props));
    assert.equal(props.truncated, true);
    assert.equal(props.query, '');
    assert.deepEqual(props.refused, []);
});

test('the floor holds a clipped spec id and integer counts per part, whatever the identity weighs', () => {
    const spec = aidPart.hydratedSpec as any;
    const part = (index: number) =>
        ({
            ...aidPart,
            index,
            hydratedSpec: {
                ...spec,
                spec_id: 's'.repeat(1000),
                identity: { ...spec.identity, shape: { kind: 'x'.repeat(3000) } },
            },
        }) as HydratedPart;
    const props = eventFor(Array.from({ length: 6 }, (_, index) => part(index)));

    assert.ok(fitsProps(props));
    assert.equal(props.truncated, true);
    assert.equal(props.resolved[0].measure, undefined);
    assert.equal(props.resolved[0].specId.length, 64);
    assert.ok(JSON.stringify(props).length < MAX_PROPS_BYTES / 4);
});
