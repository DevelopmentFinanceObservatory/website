import assert from 'node:assert/strict';
import test from 'node:test';

import {
    answerDepartures,
    assumptionClauses,
    departureAction,
    isClosestMatch,
    refsStatedBesides,
    sentenceBlocks,
    statingTokenIndex,
} from '../departures.ts';
import { normalizeResponse } from '../searchClient.ts';
import { planSentenceText } from '../sentencePlan.ts';
import { fixtures } from './fixtures/index.ts';
import { noDataResponse, wireSpec } from './fixtures/no-data.ts';
import { servedAnswer } from './fixtures/served-answer.ts';
import { servedAid } from './fixtures/served-options.ts';
import {
    crs002,
    crs006,
    crs013,
    crs038,
    crs045,
    mls037,
    weo044,
} from './fixtures/sentence-panel.ts';
import type { Departure, SentenceToken } from '../types.ts';

const blockTexts = (plan: SentenceToken[]) =>
    sentenceBlocks(plan).map(({ segment, tokens }) => [
        segment,
        tokens.map((token) => token.text).join(''),
    ]);

// ---------------------------------------------------------------------------
// sentenceBlocks
// ---------------------------------------------------------------------------

test('sentenceBlocks splits a plan into its heading and byline and leaves out the departures', () => {
    assert.deepEqual(blockTexts(crs006.sentence_plan), [
        [
            'heading',
            'Gross ODA disbursements to Ethiopia from the 27 European Union members, 1973 to 2024.',
        ],
        ['byline', 'Current US dollars · OECD Creditor Reporting System (CRS).'],
    ]);
});

test('sentenceBlocks keeps one block per run when each part is its own sentence', () => {
    assert.deepEqual(
        blockTexts(weo044.sentence_plan).map(([segment]) => segment),
        ['heading', 'byline', 'heading', 'byline', 'heading'],
    );
});

test('sentenceBlocks joins heading runs a departure separated -- a no_data part before a definite one', () => {
    assert.deepEqual(blockTexts(mls037.sentence_plan), [
        [
            'heading',
            '"education" names a category the search could not apply to this query. ' +
                "Denmark's gross ODA disbursements to 42 recipients for health, 2015 to 2024.",
        ],
        ['byline', 'Current US dollars · OECD Creditor Reporting System (CRS).'],
    ]);
    assert.deepEqual(sentenceBlocks(null), []);
});

// ---------------------------------------------------------------------------
// The assumptions clause and the mixed-answer opener
// ---------------------------------------------------------------------------

const token = (
    text: string,
    segment: SentenceToken['segment'],
    part_index?: number | null,
): SentenceToken => ({ kind: 'text', text, segment, part_index });

test('sentenceBlocks closes the plan with the assumptions clause, apart from the heading and byline', () => {
    const plan = (fixtures['broad-truncated'] as { sentence_plan: SentenceToken[] }).sentence_plan;

    assert.deepEqual(blockTexts(plan), [
        ['heading', 'Gross ODA disbursements to Kenya from 86 donors, 2015 to 2024.'],
        ['byline', 'Current US dollars · OECD Creditor Reporting System (CRS).'],
        ['assumption', 'Assumed: every donor.'],
    ]);
    assert.deepEqual(assumptionClauses(plan, ['ODA']), [
        { key: 0, prefix: null, text: 'Assumed: every donor.' },
    ]);
    // The <h1>'s accessible name is the heading alone.
    assert.equal(
        planSentenceText(plan),
        'Gross ODA disbursements to Kenya from 86 donors, 2015 to 2024.',
    );
});

test('the clause follows the departures, which the departure list draws', () => {
    const plan = [
        token('Aid to Kenya.', 'heading'),
        token(' ', 'byline'),
        token('OECD.', 'byline'),
        token(' The data holds no values for 2024.', 'departure'),
        token(' ', 'assumption'),
        token('Assumed: ', 'assumption'),
        token('official development assistance', 'assumption'),
        token('; ', 'assumption'),
        token('every provider', 'assumption'),
        token('.', 'assumption'),
    ];

    assert.deepEqual(
        blockTexts(plan).map(([segment]) => segment),
        ['heading', 'byline', 'assumption'],
    );
    assert.deepEqual(assumptionClauses(plan, ['aid']), [
        {
            key: 0,
            prefix: null,
            text: 'Assumed: official development assistance; every provider.',
        },
    ]);
});

test("assumptionClauses names each part's own clause when the plan is written part by part", () => {
    const sentence = (partIndex: number, item: string) => [
        token('Aid.', 'heading', partIndex),
        token(' ', 'byline', partIndex),
        token('OECD.', 'byline', partIndex),
        token(' ', 'assumption', partIndex),
        token('Assumed: ', 'assumption', partIndex),
        token(item, 'assumption', partIndex),
        token('.', 'assumption', partIndex),
    ];
    const plan = [
        ...sentence(0, 'every provider'),
        token(' ', 'heading', null),
        ...sentence(1, 'every country'),
    ];

    assert.deepEqual(assumptionClauses(plan, ['aid', 'debt']), [
        { key: 0, prefix: 'aid', text: 'Assumed: every provider.' },
        { key: 1, prefix: 'debt', text: 'Assumed: every country.' },
    ]);
    // A part with no clause beside one that states its own: the clause still names its part.
    const onlySecond = [
        token('Aid.', 'heading', 0),
        token(' ', 'byline', 0),
        token('OECD.', 'byline', 0),
        token(' ', 'heading', null),
        ...sentence(1, 'every country'),
    ];

    assert.deepEqual(assumptionClauses(onlySecond, ['aid', 'debt']), [
        { key: 0, prefix: 'debt', text: 'Assumed: every country.' },
    ]);
    // One joined clause over two parts, an item two parts share unowned, takes no prefix.
    const joined = [
        token('Aid and debt.', 'heading', null),
        token(' ', 'assumption', null),
        token('Assumed: ', 'assumption', null),
        token('every provider', 'assumption', 0),
        token('; ', 'assumption', null),
        token('every country', 'assumption', null),
        token('.', 'assumption', null),
    ];

    assert.deepEqual(assumptionClauses(joined, ['aid', 'debt']), [
        { key: 0, prefix: null, text: 'Assumed: every provider; every country.' },
    ]);
    assert.deepEqual(assumptionClauses(null, []), []);
});

test('assumptionClauses labels a clause by the owner of its lead token', () => {
    // A definite part beside a candidates part: one byline, two owned clauses.
    const definiteAndCandidates = [
        token('Answered 1 of 2 parts.', 'heading', null),
        token(' ', 'heading', null),
        token('Aid to Kenya', 'heading', 0),
        token('.', 'heading', 0),
        token(' ', 'byline', 0),
        token('OECD.', 'byline', 0),
        token(' ', 'assumption', 0),
        token('Assumed: ', 'assumption', 0),
        token('every provider', 'assumption', 0),
        token('.', 'assumption', 0),
        token(' ', 'heading', null),
        token('debt', 'heading', 1),
        token(' ', 'assumption', 1),
        token('Assumed: ', 'assumption', 1),
        token('every country', 'assumption', 1),
        token('.', 'assumption', 1),
    ];

    assert.deepEqual(assumptionClauses(definiteAndCandidates, ['aid', 'debt']), [
        { key: 0, prefix: 'aid', text: 'Assumed: every provider.' },
        { key: 1, prefix: 'debt', text: 'Assumed: every country.' },
    ]);
    // Parts 0 and 1 fold into one sentence: the folded clause's lead has no owner, though
    // one of its items is part 1's, so only part 2's clause takes a label.
    const folded = [
        token('Aid to Kenya.', 'heading', null),
        token(' ', 'byline', null),
        token('OECD.', 'byline', null),
        token(' ', 'assumption', null),
        token('Assumed: ', 'assumption', null),
        token('official development assistance', 'assumption', null),
        token('; ', 'assumption', null),
        token('every provider', 'assumption', 1),
        token('.', 'assumption', null),
        token(' ', 'heading', null),
        token('Debt.', 'heading', 2),
        token(' ', 'byline', 2),
        token('World Bank.', 'byline', 2),
        token(' ', 'assumption', 2),
        token('Assumed: ', 'assumption', 2),
        token('every country', 'assumption', 2),
        token('.', 'assumption', 2),
    ];

    assert.deepEqual(assumptionClauses(folded, ['aid', 'aid to Uganda', 'debt']), [
        {
            key: 0,
            prefix: null,
            text: 'Assumed: official development assistance; every provider.',
        },
        { key: 1, prefix: 'debt', text: 'Assumed: every country.' },
    ]);
});

test("a mixed answer's opener reads as plain heading text before the first part's heading", () => {
    const plan = [
        token('Answered 1 of 2 parts.', 'heading', null),
        token(' ', 'heading', null),
        { kind: 'slot', text: 'Aid to Kenya', axis: 'what', segment: 'heading', part_index: 0 },
        token('.', 'heading', 0),
        token(' ', 'byline', 0),
        token('OECD.', 'byline', 0),
    ] satisfies SentenceToken[];
    const [heading] = sentenceBlocks(plan);

    assert.deepEqual(
        heading.tokens.slice(0, 2).map(({ kind, text }) => [kind, text]),
        [
            ['text', 'Answered 1 of 2 parts.'],
            ['text', ' '],
        ],
    );
    assert.equal(planSentenceText(plan), 'Answered 1 of 2 parts. Aid to Kenya.');
});

// ---------------------------------------------------------------------------
// departureAction and answerDepartures
// ---------------------------------------------------------------------------

test("answerDepartures links a group's departures to the group token that names it", () => {
    assert.deepEqual(
        answerDepartures(crs006.parts, crs006.sentence_plan).map(
            ({ key, prefix, departure, action }) => ({ key, prefix, code: departure.code, action }),
        ),
        [
            {
                key: '0:0',
                prefix: null,
                code: 'entity_unavailable',
                action: { kind: 'token', partIndex: 0, bindingRef: 'origin:' },
            },
            {
                key: '0:1',
                prefix: null,
                code: 'group_read_as_members',
                action: { kind: 'token', partIndex: 0, bindingRef: 'origin:' },
            },
        ],
    );
});

test('departureAction opens the unit token for a unit the answer did not apply', () => {
    const [departure] = crs038.parts[0].departures;

    assert.deepEqual(
        departureAction(
            departure,
            { index: 0, status: 'definite', studioCallout: false },
            crs038.sentence_plan,
            1,
        ),
        {
            kind: 'token',
            partIndex: 0,
            bindingRef: 'unit:',
        },
    );
});

test('answerDepartures hands an operation to Studio unless the part draws the Studio callout', () => {
    const [ranking] = crs045.parts[0].departures;
    const action = (part: Parameters<typeof answerDepartures>[0][number]) =>
        answerDepartures([{ ...part, departures: [ranking] }], crs045.sentence_plan)[0].action;
    const noDataPart = (nearFields: Record<string, unknown>) =>
        normalizeResponse(noDataResponse('variable_not_resolved', null, nearFields)).parts[0];

    // The generic no_data callout already offers Studio.
    assert.equal(action(noDataPart({})), null);
    // Flagged and alternate callouts offer no Studio, so the departure keeps it.
    assert.deepEqual(action(noDataPart({ flagged_match: wireSpec('spec_flagged') })), {
        kind: 'studio',
        partIndex: 0,
    });
    assert.deepEqual(action(noDataPart({ alternate_match: wireSpec('spec_alternate') })), {
        kind: 'studio',
        partIndex: 0,
    });
    assert.deepEqual(action(crs045.parts[0]), {
        kind: 'studio',
        partIndex: 0,
    });
});

test("departureAction offers nothing for a no_data part's how check", () => {
    const [departure] = crs013.parts[0].departures;

    assert.equal(departure.binding_ref, 'how:crsTypeOfFlow');
    assert.equal(
        departureAction(
            departure,
            { index: 0, status: 'no_data', studioCallout: false },
            crs013.sentence_plan,
            1,
        ),
        null,
    );
});

test('departureAction opens Refine at a ref no visible token states, and offers nothing for a null ref', () => {
    const definite = { index: 0, status: 'definite', studioCallout: false } as const;

    // crs-002 carries how:crsPurpose as an empty slot token.
    assert.deepEqual(
        departureAction(
            { code: 'scope_limited', binding_ref: 'how:crsPurpose' },
            definite,
            crs002.sentence_plan,
            1,
        ),
        { kind: 'refine', partIndex: 0, bindingRef: 'how:crsPurpose' },
    );
    assert.equal(
        departureAction(
            { code: 'modelled_values', binding_ref: null },
            definite,
            crs002.sentence_plan,
            1,
        ),
        null,
    );
});

test('departureAction opens the token that states a ref it does not carry as its binding_ref', () => {
    const { plan } = servedAnswer(servedAid);
    const definite = { index: 0, status: 'definite', studioCallout: false } as const;
    const flow = { code: 'scope_limited', binding_ref: 'how:crsTypeOfFlow' } as const;

    // "gross ODA disbursements" states the flow.
    assert.deepEqual(departureAction(flow, definite, plan, 1), {
        kind: 'token',
        partIndex: 0,
        bindingRef: 'how:crsTypeOfFlow',
    });
    assert.equal(
        plan[statingTokenIndex(plan, 1, 0, 'how:crsTypeOfFlow')].text,
        'gross ODA disbursements',
    );
});

test('departureAction opens the source token for a source departure, through states or on a wire without them', () => {
    const { plan } = servedAnswer(servedAid);
    const definite = { index: 0, status: 'definite', studioCallout: false } as const;
    const source = { code: 'scope_limited', binding_ref: 'source:' } as const;
    const opensSource = { kind: 'token', partIndex: 0, bindingRef: 'source:' };

    // The byline source token states "source:" without binding it.
    assert.deepEqual(departureAction(source, definite, plan, 1), opensSource);
    assert.equal(
        plan[statingTokenIndex(plan, 1, 0, 'source:')].text,
        'OECD Creditor Reporting System (CRS)',
    );
    // crs-002 predates `states`, and its source token carries no binding_ref.
    assert.deepEqual(departureAction(source, definite, crs002.sentence_plan, 1), opensSource);
});

test("refsStatedBesides reads the other tokens' states, and their binding_ref alone on a wire without states", () => {
    const { plan } = servedAnswer(servedAid);
    const measure = plan.find((token) => token.axis === 'what')!;
    const besides = refsStatedBesides(plan, 1, measure);

    // The unit token states the price basis; the measure's own refs are
    // left out.
    assert.ok(besides.has('axis:measurementQualifier'));
    assert.ok(!besides.has('how:crsTypeOfFlow'));

    const bare = plan.map((token): SentenceToken => ({ ...token, states: undefined }));
    const bareMeasure = bare.find((token) => token.axis === 'what')!;

    assert.ok(refsStatedBesides(bare, 1, bareMeasure).has('unit:'));
    assert.ok(!refsStatedBesides(bare, 1, bareMeasure).has('axis:measurementQualifier'));
});

test('departureAction opens a token only on a definite part', () => {
    assert.equal(
        departureAction(
            { code: 'year_unavailable', binding_ref: 'when:' },
            { index: 0, status: 'candidates', studioCallout: false },
            crs002.sentence_plan,
            1,
        ),
        null,
    );
});

test("departureAction reads only the part's own tokens and the shared ones in a multi-part plan", () => {
    const plan: SentenceToken[] = [
        { kind: 'slot', text: 'Kenya', segment: 'heading', binding_ref: 'where:', part_index: 0 },
        { kind: 'text', text: ' and ', segment: 'heading' },
        { kind: 'slot', text: 'GDP', segment: 'heading', axis: 'what', part_index: 1 },
        { kind: 'slot', text: '2010 to 2024', segment: 'heading', binding_ref: 'when:' },
    ];
    const departure = (ref: string): Pick<Departure, 'code' | 'binding_ref'> => ({
        code: 'year_unavailable',
        binding_ref: ref,
    });
    const second = { index: 1, status: 'definite', studioCallout: false } as const;

    // Part 0's place token does not state part 1's place.
    assert.deepEqual(departureAction(departure('where:'), second, plan, 2), {
        kind: 'refine',
        partIndex: 1,
        bindingRef: 'where:',
    });
    assert.deepEqual(departureAction(departure('when:'), second, plan, 2), {
        kind: 'token',
        partIndex: 1,
        bindingRef: 'when:',
    });
});

test("answerDepartures prefixes each departure with its part's variable text when there are several parts", () => {
    assert.deepEqual(
        answerDepartures(mls037.parts, mls037.sentence_plan).map(({ prefix, action }) => ({
            prefix,
            action,
        })),
        [
            // A no_data part's operation and how check both read as plain sentences.
            { prefix: 'multilateral aid for education', action: null },
            { prefix: 'multilateral aid for education', action: null },
        ],
    );
});

test('isClosestMatch reads the closest_match departure', () => {
    assert.equal(isClosestMatch({ departures: [{ code: 'closest_match', text: 'x' }] }), true);
    assert.equal(isClosestMatch(crs006.parts[0]), false);
    assert.equal(isClosestMatch(null), false);
});
