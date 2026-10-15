/* eslint-disable @typescript-eslint/no-explicit-any -- reads the flat page Spec, typed shallowly */
import assert from 'node:assert/strict';
import test from 'node:test';

import { fitsProps, MAX_PROPS_BYTES } from '../../events/limits.ts';
import {
    searchEventProps,
    searchOutcome,
    searchPostTracker,
    startSearchAction,
    type SearchIds,
    type SearchPostEventName,
    type SearchSettleProps,
} from '../searchEvents.ts';
import type { HydratedPart, ResolveResponse } from '../types.ts';

// "ODA from France to Kenya" against the dev API elects 308 CRS StatVars;
// "to all recipients" resolves some 200 places.
const entities = Array.from({ length: 204 }, (_, i) => ({
    ref: `country/C${String(i).padStart(2, '0')}`,
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
            resolved_sources: [{ ref: 'dc/base/OECD_CRS', label: 'OECD CRS' }],
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
                    ref: `provenance/${String(at).padStart(length, 's')}`,
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
                },
                entity_groups: { destination: { ref: 'grp/UN', label: 'UN members' } },
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

const run: SearchSettleProps = {
    searchId: 'search-1',
    post: 0,
    source: 'typed',
    edited: false,
    traceId: 'trace-1',
    ms: 1200,
    outcome: 'definite',
    engineMs: 900,
    byStep: { extract: 300, resolve: 500 },
    timedOut: false,
};

test('the run fields ride every rung, the floor without its step timings', () => {
    const spec = aidPart.hydratedSpec as any;
    const heavy = (index: number) =>
        ({
            ...aidPart,
            index,
            hydratedSpec: {
                ...spec,
                spec_id: 's'.repeat(1000),
                identity: { ...spec.identity, shape: { kind: 'x'.repeat(3000) } },
            },
        }) as HydratedPart;
    const { byStep, ...kept } = run;
    const rungs = [
        [aidPart],
        Array.from({ length: 6 }, (_, index) => ({ ...withSources(aidPart, 10, 140), index })),
        Array.from({ length: 6 }, (_, index) => heavy(index)),
    ] as HydratedPart[][];

    for (const parts of rungs) {
        const props = searchEventProps({
            query: 'q',
            edited: false,
            kind: 'resolution',
            reason: null,
            parts,
            run,
        });
        const floor = props.query === '';

        assert.ok(fitsProps(props));
        assert.deepEqual(
            { ...kept, ...(!floor && { byStep }) },
            Object.fromEntries(
                Object.keys(run)
                    .filter((key) => key in props)
                    .map((key) => [key, props[key as keyof typeof props]]),
            ),
        );
    }
});

const response = (kind: string, extra: object = {}) =>
    ({
        kind,
        diagnostics: { trace_id: 'trace-r', timing_ms: { total: 800, by_step: { extract: 100 } } },
        parts: [],
        scope: { place: null },
        ...extra,
    }) as unknown as ResolveResponse;

test('the outcome is a resolution status, else the answer kind', () => {
    for (const status of ['definite', 'candidates', 'no_data', 'unsupported', 'mixed']) {
        assert.equal(searchOutcome(response('resolution', { status })), status);
    }
    assert.equal(searchOutcome(response('catalogue')), 'catalogue');
    assert.equal(searchOutcome(response('declined', { reason: 'out_of_scope' })), 'declined');
});

/** A tracker over a fake clock, and the events it sent. */
const tracked = (post = 0) => {
    const sent: [SearchPostEventName, Record<string, any>][] = [];
    let clock = 1000;
    const tracker = searchPostTracker(
        {
            searchId: 'search-1',
            post,
            source: 'example',
            editKind: post > 0 ? 'slot' : null,
            query: 'ODA to Kenya',
        },
        { emit: (name, props) => sent.push([name, props]), now: () => clock },
    );

    return { tracker, sent, advance: (ms: number) => (clock += ms) };
};

const done = { trace_id: 'trace-d', elapsed_ms: 2500, timed_out: true };

test('a post sends one terminal event: the first of settle, fail and abandon', () => {
    const { tracker, sent, advance } = tracked();

    tracker.respond(response('resolution', { status: 'definite' }));
    advance(3000);
    tracker.settle({
        response: response('resolution', { status: 'definite' }),
        parts: [aidPart],
        done,
    });
    tracker.settle({ response: response('catalogue'), parts: [], done });
    tracker.fail({ code: 'STALL_TIMEOUT' });
    tracker.abandon('superseded');
    tracker.hide();

    assert.equal(sent.length, 1);

    const [[name, props]] = sent;

    assert.equal(name, 'search.query');
    assert.deepEqual(
        {
            searchId: props.searchId,
            post: props.post,
            source: props.source,
            edited: props.edited,
            traceId: props.traceId,
            ms: props.ms,
            outcome: props.outcome,
            engineMs: props.engineMs,
            byStep: props.byStep,
            timedOut: props.timedOut,
            hidden: props.hidden,
        },
        {
            searchId: 'search-1',
            post: 0,
            source: 'example',
            edited: false,
            traceId: 'trace-d',
            ms: 3000,
            outcome: 'definite',
            engineMs: 2500,
            byStep: { extract: 100 },
            timedOut: true,
            hidden: undefined,
        },
    );
});

test('a base run that answered nothing is search.empty, an edit post is search.edit', () => {
    const base = tracked();
    const edit = tracked(2);

    base.tracker.settle({
        response: response('resolution', { status: 'no_data' }),
        parts: [refusedPart],
        done,
    });
    edit.tracker.settle({
        response: response('resolution', { status: 'no_data' }),
        parts: [refusedPart],
        done,
    });

    assert.equal(base.sent[0][0], 'search.empty');
    assert.equal(edit.sent[0][0], 'search.edit');
    assert.equal(edit.sent[0][1].post, 2);
    assert.equal(edit.sent[0][1].edited, true);
    assert.equal(edit.sent[0][1].editKind, 'slot');
    assert.equal(edit.sent[0][1].outcome, 'no_data');
});

test('a hidden post sends one hidden abandon and marks its later settle', () => {
    const { tracker, sent, advance } = tracked();

    tracker.step('extract');
    advance(400);
    tracker.hide();
    tracker.hide();
    advance(600);
    tracker.settle({ response: response('catalogue'), parts: [], done });

    assert.deepEqual(
        sent.map(([name, props]) => [name, props.reason, props.step, props.ms, props.hidden]),
        [
            ['search.abandon', 'hidden', 'extract', 400, undefined],
            ['search.query', null, undefined, 1000, true],
        ],
    );
});

test('a settled post ignores a later hide, and an abandoned one sends nothing more', () => {
    const settled = tracked();
    const superseded = tracked(1);
    const left = tracked();

    settled.tracker.settle({ response: response('catalogue'), parts: [], done });
    settled.tracker.hide();
    superseded.tracker.abandon('superseded');
    superseded.tracker.abandon('reset');
    // The search unmounted, then its stream's answer landed.
    left.tracker.abandon('left');
    left.tracker.settle({ response: response('catalogue'), parts: [], done });

    assert.deepEqual(
        settled.sent.map(([name]) => name),
        ['search.query'],
    );
    assert.deepEqual(
        superseded.sent.map(([name, props]) => [name, props.reason, props.traceId]),
        [['search.abandon', 'superseded', null]],
    );
    assert.deepEqual(
        left.sent.map(([name, props]) => [name, props.reason]),
        [['search.abandon', 'left']],
    );
});

test('an action names the search on screen when it started, not when it landed', () => {
    const sent: [string, Record<string, unknown>][] = [];
    let onScreen: SearchIds = { searchId: 'search-a', traceId: 'trace-a' };
    const send = startSearchAction<{ action: 'share'; shareId: string }>(
        () => onScreen,
        (name, props) => sent.push([name, props]),
    );

    onScreen = { searchId: 'search-b', traceId: 'trace-b' };
    send({ action: 'share', shareId: 'share-1' });

    assert.deepEqual(sent, [
        [
            'search.action',
            { searchId: 'search-a', traceId: 'trace-a', action: 'share', shareId: 'share-1' },
        ],
    ]);
});

test('a failure carries its code, else its HTTP status, and the trace it names', () => {
    const coded = tracked();
    const status = tracked();
    const silent = tracked();
    const noAnswer = tracked();

    coded.tracker.fail({ code: 'over_ceiling', status: 422, traceId: 'trace-e' });
    status.tracker.respond(response('catalogue'));
    status.tracker.fail({ status: 503 });
    silent.tracker.fail({});
    noAnswer.tracker.settle({ response: null, parts: [], done });

    assert.deepEqual(
        [coded, status, silent, noAnswer].map(({ sent: [[name, props]] }) => [
            name,
            props.error,
            props.status,
            props.traceId,
            props.query,
        ]),
        [
            ['search.error', 'over_ceiling', 422, 'trace-e', 'ODA to Kenya'],
            ['search.error', '503', 503, 'trace-r', 'ODA to Kenya'],
            ['search.error', 'stream', undefined, null, 'ODA to Kenya'],
            ['search.error', 'no_response', undefined, 'trace-d', 'ODA to Kenya'],
        ],
    );
});
