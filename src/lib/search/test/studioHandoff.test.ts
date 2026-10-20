/* eslint-disable @typescript-eslint/no-explicit-any -- reads the raw wire fixtures */
/**
 * `studioHandoff.ts`: the question and seeds a Studio action hands over,
 * and Studio's URL for them. The last test follows the design's case: an
 * `explain` question, its place and year edited, then a Studio click.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_PROPS_BYTES } from '../../events/limits.ts';
import { EVENT_SAMPLE, searchEventName, searchEventProps } from '../searchEvents.ts';
import { flattenSpec, normalizeResponse, unflattenSpec } from '../searchClient.ts';
import { planSentenceText } from '../sentencePlan.ts';
import { handoffEdited, handoffQuestion, handoffSeeds, studioHref } from '../studioHandoff.ts';
import { type HydratedPart, knownPart, type Operation, type Part } from '../types.ts';
import { fixtures, type FixtureName } from './fixtures/index.ts';

/** The fixture's normalized parts as a settled run holds them. */
function hydratedParts(name: FixtureName): HydratedPart[] {
    const parts: Part[] = normalizeResponse(fixtures[name]).parts;

    return parts.map((part, index) => {
        const known = knownPart(part);

        return {
            index,
            variableText: part.variable_text ?? null,
            part,
            hydratedSpec: known?.status === 'definite' ? known.spec : null,
            observationsPending: false,
            phase: 'done',
            editError: null,
        };
    });
}

const wireSpecOf = (name: FixtureName, index = 0) => (fixtures[name] as any).parts[index].spec;

test('handoffQuestion is the query until a part is edited', () => {
    assert.equal(
        handoffQuestion({ query: 'Why did it fall?', edited: false, sentence: 'Aid to Kenya.' }),
        'Why did it fall?',
    );
});

test('handoffQuestion is the rendered sentence once a part is edited', () => {
    assert.equal(
        handoffQuestion({ query: 'Why did it fall?', edited: true, sentence: ' Aid to Kenya. ' }),
        'Aid to Kenya.',
    );
});

test('handoffQuestion keeps the query when an edited answer has no sentence', () => {
    assert.equal(
        handoffQuestion({ query: 'Why did it fall?', edited: true, sentence: null }),
        'Why did it fall?',
    );
});

test('handoffSeeds hands over the wire spec and the operations of a definite part', () => {
    assert.deepEqual(handoffSeeds(hydratedParts('definite-rank-operation')), [
        {
            spec: wireSpecOf('definite-rank-operation'),
            operations: [{ verb: 'rank', phrase: 'top 5 donors', over: 'origin' }],
        },
    ]);
});

test("handoffSeeds hands over a Spec's groups with their node under `ref`, the keys Studio's seed accepts", () => {
    const [seed] = handoffSeeds(hydratedParts('region-group'));

    assert.deepEqual((seed?.spec.resolved as any).entity_groups, {
        observationAbout: { ref: 'africa', label: 'Africa', entity_type: 'Continent' },
    });
});

test('handoffSeeds skips a part that is not definite', () => {
    const seeds = handoffSeeds(hydratedParts('two-part-ambiguous'));

    assert.deepEqual(
        seeds.map((seed) => seed.spec.spec_id),
        [wireSpecOf('two-part-ambiguous').spec_id],
    );
});

test('handoffSeeds gives a folded part one seed with the operations of both', () => {
    const [part] = hydratedParts('definite-rank-operation');
    const folded: HydratedPart = {
        ...part,
        index: 1,
        part: {
            ...part.part!,
            operations: [
                { verb: 'rank', phrase: 'top 5 donors', over: 'origin' },
                { verb: 'growth', phrase: 'change since 2015', over: null },
                // A verb Studio's wire does not name stays out of the seed.
                { verb: 'tally', phrase: 'tally them', over: null },
            ],
        },
    };
    const seeds = handoffSeeds([part, folded]);

    assert.equal(seeds.length, 1);
    assert.deepEqual(
        seeds[0].operations.map((operation) => operation.verb),
        ['rank', 'growth'],
    );
});

test('handoffSeeds skips a spec with no definition, which Studio would refuse', () => {
    const [part] = hydratedParts('definite-single');
    const definite = knownPart(part.part);

    assert.ok(definite?.status === 'definite');

    const bare: HydratedPart = {
        ...part,
        part: { ...definite, spec: { ...definite.spec, definition: null } },
    };

    assert.deepEqual(handoffSeeds([bare]), []);
});

test('unflattenSpec keeps the trace flattenSpec also reads as `resolution`', () => {
    const wire = structuredClone(wireSpecOf('definite-single'));

    wire.resolved.trace = { resolved_entities: [{ ref: 'country/KEN' }] };

    assert.deepEqual(unflattenSpec(flattenSpec(wire)), wire);
});

test('studioHref carries the question, and the token when there is one', () => {
    assert.equal(studioHref('Aid to Kenya?', null), '/studio?q=Aid+to+Kenya%3F');
    assert.equal(studioHref('Aid to Kenya?', 'abc-123'), '/studio?q=Aid+to+Kenya%3F&seed=abc-123');
});

test('a Studio click after a place and year edit hands over the edited question and seed', () => {
    const query = 'Why did the population of Ethiopia fall in 2023?';
    const before = hydratedParts('definite-explain-operation');

    // Before the edit: the query, and the seed on Ethiopia in 2023.
    assert.equal(
        handoffQuestion({
            query,
            edited: false,
            sentence: planSentenceText(
                normalizeResponse(fixtures['definite-explain-operation']).sentence_plan,
            ),
        }),
        query,
    );
    assert.deepEqual((handoffSeeds(before)[0].spec.definition.identity as any).entities, {
        observationAbout: ['country/ETH'],
    });

    // The edit's answer replaces every part; the user has an edit on record.
    const edited = normalizeResponse(fixtures['definite-explain-edited']);
    const after = hydratedParts('definite-explain-edited');
    const question = handoffQuestion({
        query,
        edited: true,
        sentence: planSentenceText(edited.sentence_plan),
    });
    const [seed, ...rest] = handoffSeeds(after);
    const { identity } = seed.spec.definition as any;

    assert.equal(question, 'Total population in Kenya in 2022, according to 4 sources.');
    assert.deepEqual(rest, []);
    assert.deepEqual(identity.entities, { observationAbout: ['country/KEN'] });
    assert.deepEqual(identity.requested_window, {
        kind: 'range',
        start_year: 2022,
        end_year: 2022,
    });
    assert.equal(seed.spec.spec_id, 'spec_explain_kenya_2022');
    assert.deepEqual(seed.spec, wireSpecOf('definite-explain-edited'));
    assert.deepEqual(seed.operations, [{ verb: 'explain', phrase: 'why did it fall', over: null }]);

    // The click's event describes the same answer.
    const props = searchEventProps({
        query,
        edited: true,
        kind: 'resolution',
        reason: null,
        parts: after,
    });

    assert.equal(props.edited, true);
    assert.deepEqual(props.operations, ['explain']);
    assert.deepEqual(
        props.resolved.map((entry) => entry.specId),
        ['spec_explain_kenya_2022'],
    );
});

test('a Studio click on an opened share saved after an edit hands over the sentence and its seed', () => {
    // The sharer asked about Ethiopia in 2023, edited to Kenya in 2022 and
    // shared. The link replays the Kenya 2022 identity under the sharer's
    // original query, and the opener has made no edit of their own.
    const query = 'Why did the population of Ethiopia fall in 2023?';
    // The plan's byline stays off the question.
    const opened = normalizeResponse(fixtures['definite-explain-edited']);
    const plan = [
        ...opened.sentence_plan,
        { kind: 'slot', text: ' Persons.', axis: 'unit', segment: 'byline', entity_refs: [] },
    ];
    const edited = handoffEdited({ editCount: 0, fromShare: true });
    const question = handoffQuestion({ query, edited, sentence: planSentenceText(plan) });
    const [seed] = handoffSeeds(hydratedParts('definite-explain-edited'));

    assert.equal(edited, true);
    assert.equal(question, 'Total population in Kenya in 2022, according to 4 sources.');
    assert.deepEqual((seed.spec.definition.identity as any).entities, {
        observationAbout: ['country/KEN'],
    });
    assert.equal(handoffEdited({ editCount: 0, fromShare: false }), false);
    assert.equal(handoffEdited({ editCount: 1, fromShare: false }), true);
});

test('handoffSeeds keeps two forecasts of one phrase that differ in target year', () => {
    const [part] = hydratedParts('definite-explain-operation');
    const forecast = (target_year: number) =>
        ({ verb: 'forecast', phrase: 'by then', over: null, target_year }) as const;
    const asking = (operations: Operation[]): HydratedPart => ({
        ...part,
        part: { ...part.part!, operations },
    });
    // The same spec asked twice folds into one seed; an operation already on it is not added again.
    const [seed] = handoffSeeds([
        asking([forecast(2030)]),
        asking([forecast(2035), forecast(2030)]),
    ]);

    assert.deepEqual(
        seed.operations.map((op) => op.target_year),
        [2030, 2035],
    );
});

test('searchEventProps counts the served StatVars, else the family', () => {
    const [part] = hydratedParts('definite-single');
    const spec = part.hydratedSpec as any;
    const props = (stat_vars: unknown) =>
        searchEventProps({
            query: 'Population of Kenya',
            edited: false,
            kind: 'resolution',
            reason: null,
            parts: [{ ...part, hydratedSpec: { ...spec, stat_vars } }],
        }).resolved[0];

    assert.equal(
        props({ member_count: 486, member_count_exact: true, served_count: 12 }).statVarCount,
        12,
    );
    // An unsettled membership counts the family.
    assert.equal(
        props({ member_count: 486, member_count_exact: true, served_count: null }).statVarCount,
        486,
    );
});

test('searchEventProps fits the events cap on the largest answer the API can send', () => {
    // Six parts (the API's cap), each serving 486 StatVars over 28 places and
    // 10 long source ids, under a 2,000-character question: the Germany to
    // Kenya answer posted 61 KB when it listed them. The identity itself is
    // wide too: three set-valued measures and a named group of 193 countries.
    const [part] = hydratedParts('definite-single');
    const spec = part.hydratedSpec as any;
    const ref = (prefix: string, at: number) => `${prefix}_${'x'.repeat(140)}_${at}`;
    const members = Array.from(
        { length: 193 },
        (_, at) => `country/C${String(at).padStart(3, '0')}`,
    );
    const wide = {
        ...part,
        hydratedSpec: {
            ...spec,
            identity: {
                ...spec.identity,
                slots: ['crsPurpose', 'crsTypeOfFlow', 'nettingBasis'].map((property) => ({
                    property,
                    binding: {
                        state: 'set',
                        refs: ['A', 'B', 'C'].map((id) => `${property}${id}`),
                    },
                })),
                entities: { ...spec.identity.entities, destination: members },
            },
            entity_groups: { destination: { ref: 'grp/UN', label: 'United Nations members' } },
            stat_vars: { member_count: 486, member_count_exact: true, served_count: 486 },
            resolution: {
                ...spec.resolution,
                resolved_entities: Array.from({ length: 28 }, (_, at) => ({
                    ref: `country/C${at}`,
                })),
                resolved_sources: Array.from({ length: 10 }, (_, at) => ({
                    ref: ref('provenance/Source', at),
                })),
            },
        },
    };
    const props = searchEventProps({
        query: 'q'.repeat(2000),
        edited: true,
        kind: 'resolution',
        reason: null,
        parts: Array.from({ length: 6 }, (_, index) => ({ ...wide, index })),
    });

    assert.ok(JSON.stringify(props).length <= MAX_PROPS_BYTES);
    assert.equal(props.truncated, undefined);
    assert.equal(props.resolved[0].sources?.length, 3);
    assert.equal(props.resolved.length, 6);
    assert.equal(props.resolved[0].statVarCount, 486);
    assert.equal(props.resolved[0].entityCount, 28);
    assert.equal(props.resolved[0].entities?.destination.count, 193);
    assert.equal(props.query.length, 500);
    assert.deepEqual(props.resolved[0].measure, spec.identity.shape);
});

test('searchEventProps keeps the first three entity terms of a refused part', () => {
    const terms = ['Kenya', 'Chad', 'Mali', 'Togo', 'Peru'];
    const props = searchEventProps({
        query: 'x',
        edited: false,
        kind: 'resolution',
        reason: null,
        parts: [
            {
                index: 0,
                variableText: 'v'.repeat(300),
                part: { status: 'no_data', no_data: { reason: 'no_statvar', entity_terms: terms } },
                hydratedSpec: null,
            } as unknown as HydratedPart,
        ],
    });

    assert.deepEqual(props.refused[0].entityTerms, terms.slice(0, EVENT_SAMPLE));
    assert.equal(props.refused[0].variableText?.length, 100);
});

test('searchEventProps describes a declined answer with no parts as search.empty', () => {
    const props = searchEventProps({
        query: 'What should the next IDA replenishment prioritise?',
        edited: false,
        kind: 'declined',
        reason: 'requires_analysis',
        parts: [],
    });

    assert.deepEqual(props, {
        query: 'What should the next IDA replenishment prioritise?',
        edited: false,
        kind: 'declined',
        reason: 'requires_analysis',
        operations: [],
        resolved: [],
        refused: [],
    });
    assert.equal(searchEventName(props), 'search.empty');
});

test('searchEventName counts a catalogue answer and a resolved part as search.query', () => {
    const catalogue = searchEventProps({
        query: 'What data do you have?',
        edited: false,
        kind: 'catalogue',
        reason: null,
        parts: [],
    });
    const resolved = searchEventProps({
        query: 'Top 5 donors',
        edited: false,
        kind: 'resolution',
        reason: null,
        parts: hydratedParts('definite-rank-operation'),
    });

    assert.equal(searchEventName(catalogue), 'search.query');
    assert.equal(searchEventName(resolved), 'search.query');
    assert.deepEqual(resolved.operations, ['rank']);
});

test('searchEventName counts a resolution with nothing resolved as search.empty', () => {
    const props = searchEventProps({
        query: 'ODA to Congo from France in 2022',
        edited: false,
        kind: 'resolution',
        reason: null,
        parts: hydratedParts('entity-ambiguous'),
    });

    assert.equal(searchEventName(props), 'search.empty');
    assert.equal(props.refused[0].reason, 'entity_ambiguous');
});
