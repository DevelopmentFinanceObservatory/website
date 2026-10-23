import assert from 'node:assert/strict';
import test from 'node:test';

import { basisNote, foldReadings, readingOf, readingsSummary } from '../readings.ts';
import type { SentenceToken } from '../types.ts';

const heading = (text: string, part_index?: number | null): SentenceToken => ({
    kind: 'text',
    text,
    segment: 'heading',
    part_index,
});

const byline = (text: string, part_index?: number | null): SentenceToken => ({
    kind: 'text',
    text,
    segment: 'byline',
    part_index,
});

// A recorded candidate spec's own plan (crs panel, "poverty reduction
// grants"): heading slots, then a byline led by the source.
const readingPlan: SentenceToken[] = [
    {
        kind: 'slot',
        text: 'Official development assistance grants for poverty reduction',
        axis: 'what',
        segment: 'heading',
    },
    heading(' '),
    { kind: 'slot', text: 'in percent', axis: 'unit', segment: 'heading' },
    heading(' in '),
    {
        kind: 'slot',
        text: 'Africa and United Kingdom',
        axis: 'where',
        segment: 'heading',
        binding_ref: 'where:',
    },
    heading(', '),
    { kind: 'slot', text: '2000 to 2022', axis: 'when', segment: 'heading', binding_ref: 'when:' },
    heading('.'),
    byline(' '),
    { kind: 'slot', text: 'SDG Indicators Database', axis: 'source', segment: 'byline' },
    byline('.'),
];

// The part's own summary: "2 readings." then each reading as text tokens.
const summaryPlan = (part_index?: number | null): SentenceToken[] => [
    heading('2 readings.', part_index),
    heading(' ', part_index),
    heading('Grants for poverty reduction.', part_index),
    byline(' ', part_index),
    byline('SDG Indicators Database · 2000 to 2022.', part_index),
    heading(' ', part_index),
    heading('Grants for poverty reduction, by recipient.', part_index),
];

test('readingOf draws the heading and byline from the reading plan as text, with its measure token', () => {
    const reading = readingOf({ sentence_plan: readingPlan });

    assert.equal(
        reading.heading,
        'Official development assistance grants for poverty reduction in percent in Africa and United Kingdom, 2000 to 2022.',
    );
    assert.equal(reading.byline, 'SDG Indicators Database.');
    assert.equal(reading.measure?.axis, 'what');
    // A plan without `states`: each other token states its own binding_ref,
    // and the source token states "source:".
    assert.deepEqual(reading.statedElsewhere, new Set(['where:', 'when:', 'source:']));
    assert.deepEqual(readingOf({}), {
        heading: '',
        byline: '',
        measure: null,
        statedElsewhere: new Set(),
    });
});

test('readingsSummary reads the whole summary plan, byline included', () => {
    assert.equal(
        readingsSummary(summaryPlan()),
        '2 readings. Grants for poverty reduction. SDG Indicators Database · 2000 to 2022. Grants for poverty reduction, by recipient.',
    );
});

test('readingsSummary reads a token with no segment as heading, the wire default', () => {
    const [lead, ...rest] = summaryPlan();

    assert.equal(
        readingsSummary([{ ...lead, segment: undefined }, ...rest]),
        readingsSummary(summaryPlan()),
    );
});

test("foldReadings folds a candidates part's summary into one what-token named by its variable text", () => {
    const folded = foldReadings(summaryPlan(0), [
        { status: 'candidates', variable_text: 'poverty reduction grants' },
    ]);

    assert.deepEqual(folded, [
        {
            kind: 'slot',
            axis: 'what',
            text: 'poverty reduction grants',
            segment: 'heading',
            part_index: 0,
        },
    ]);
});

test('foldReadings falls back to the summary heading and leaves other parts and shared tokens alone', () => {
    const definite: SentenceToken = {
        kind: 'slot',
        text: 'Aid to Kenya',
        axis: 'what',
        segment: 'heading',
        part_index: 0,
    };
    const plan = [definite, heading(' and ', null), ...summaryPlan(1), heading('.', null)];
    const folded = foldReadings(plan, [
        { status: 'definite', variable_text: 'aid to Kenya' },
        { status: 'candidates', variable_text: null },
    ]);

    assert.deepEqual(
        folded.map((token) => [token.kind, token.text, token.part_index]),
        [
            ['slot', 'Aid to Kenya', 0],
            ['text', ' and ', null],
            [
                'slot',
                '2 readings. Grants for poverty reduction. Grants for poverty reduction, by recipient.',
                1,
            ],
            ['text', '.', null],
        ],
    );
});

test("foldReadings keeps a candidates part's assumptions clause, and readingsSummary leaves it to the answer block", () => {
    const clause = (text: string): SentenceToken => ({
        kind: 'text',
        text,
        segment: 'assumption',
        part_index: 0,
    });
    const plan = [
        ...summaryPlan(0),
        clause(' '),
        clause('Assumed: '),
        clause('every provider'),
        clause('.'),
    ];
    const folded = foldReadings(plan, [
        { status: 'candidates', variable_text: 'poverty reduction grants' },
    ]);

    assert.deepEqual(
        folded.map((token) => [token.segment, token.text]),
        [
            ['heading', 'poverty reduction grants'],
            ['assumption', ' '],
            ['assumption', 'Assumed: '],
            ['assumption', 'every provider'],
            ['assumption', '.'],
        ],
    );
    assert.equal(readingsSummary(plan), readingsSummary(summaryPlan(0)));
});

test('foldReadings returns the plan itself when no part is a candidates part', () => {
    const plan = [heading('Aid to Kenya.', 0)];

    assert.equal(foldReadings(plan, [{ status: 'definite', variable_text: 'aid' }]), plan);
});

test('basisNote leads a rival reading with why it is offered, and the elected one with nothing', () => {
    assert.equal(basisNote('direction'), 'The same measure, read in the other direction');
    assert.equal(basisNote('twin'), 'An equivalent series that holds data');
    assert.equal(basisNote(null), null);
    // Today's server sends no basis.
    assert.equal(basisNote(undefined), null);
});
