import assert from 'node:assert/strict';
import test from 'node:test';

import {
    KIND_MIN,
    REASONS,
    T_HIGH,
    T_LOW,
    candidatesOf,
    changedText,
    decide,
    evergreenRequest,
    kindId,
    sentenceSpans,
    volatileId,
} from '../evergreenRule.ts';

const sentences = (text: string) =>
    sentenceSpans(text).map(({ start, end }) => text.slice(start, end));

test('text splits into sentences at their ends and at line breaks', () => {
    const cases: [string, string[]][] = [
        ['ODA fell. Germany rose.', ['ODA fell.', 'Germany rose.']],
        ['Is it rising? Yes! It is.', ['Is it rising?', 'Yes!', 'It is.']],
        [
            'The target is 0.7% of GNI. The dotted line marks it.',
            ['The target is 0.7% of GNI.', 'The dotted line marks it.'],
        ],
        [
            'Values are in U.S. dollars. Each bar is a year.',
            ['Values are in U.S. dollars.', 'Each bar is a year.'],
        ],
        [
            'Sectors, e.g. Health, are grouped. Read left to right.',
            ['Sectors, e.g. Health, are grouped.', 'Read left to right.'],
        ],
        ['It rose (in 2024). Then it fell.', ['It rose (in 2024).', 'Then it fell.']],
        ['It says "ODA fell." Then it stops.', ['It says "ODA fell."', 'Then it stops.']],
        ['the end. lower case follows', ['the end. lower case follows']],
        [
            '  - Select a country.\n- Hover over a segment.\n',
            ['Select a country.', 'Hover over a segment.'],
        ],
        [
            '## How to read it\n1. Pick a donor\n> Quoted line',
            ['How to read it', 'Pick a donor', 'Quoted line'],
        ],
        ['---\n\n2024\nA line', ['A line']],
        ['', []],
    ];

    for (const [text, expected] of cases) {
        assert.deepEqual(sentences(text), expected, JSON.stringify(text));
    }
});

test('candidates carry their field and offsets into that field', () => {
    const text = {
        title: 'ODA by donor',
        description: null,
        contentTitle: undefined,
        content: 'This chart shows ODA.\n- Norway gives the most.',
    };
    const candidates = candidatesOf(text);

    assert.deepEqual(
        candidates.map(({ field, start, end }) => [field, start, end]),
        [
            ['title', 0, 12],
            ['content', 0, 21],
            ['content', 24, 46],
        ],
    );

    for (const candidate of candidates) {
        assert.equal(text[candidate.field]?.slice(candidate.start, candidate.end), candidate.text);
    }
});

test('the request asks a Noul and a Choice about each candidate by its path', () => {
    const request = evergreenRequest(candidatesOf({ content: 'One here. Two here.' }));

    assert.deepEqual(
        request.state.sentences.map((sentence) => sentence.text),
        ['One here.', 'Two here.'],
    );
    assert.deepEqual(Object.keys(request.questions).sort(), [
        kindId(0),
        kindId(1),
        volatileId(0),
        volatileId(1),
    ]);
    assert.equal(request.questions[volatileId(1)].type, 'noul');
    assert.match(request.questions[volatileId(1)].instructions, /`sentences\[1\]\.text`/);
    assert.equal(request.questions[kindId(1)].type, 'choice');
    assert.match(request.questions[kindId(1)].instructions, /`sentences\[1\]\.text`/);
});

const noul = (value: number) => ({ type: 'noul', noul: value });
const kind = (choice: string, held: number) => ({
    type: 'choice',
    choice,
    confidence: held,
    probabilities: { [choice]: held },
});

test('a candidate at or above T_HIGH is refused with the kind its Choice holds', () => {
    const content = 'This chart shows ODA. Norway gives the most. ODA fell. It rose. Aid is up.';
    const candidates = candidatesOf({ content });
    const answers = {
        [volatileId(0)]: noul(0.05),
        [kindId(0)]: kind('other', 0.9),
        [volatileId(1)]: noul(0.95),
        [kindId(1)]: kind('ranking', 0.9),
        [volatileId(2)]: noul(T_HIGH),
        [kindId(2)]: kind('trend', KIND_MIN - 0.01),
        [volatileId(3)]: noul(0.9),
        [kindId(3)]: kind('other', 0.99),
        [volatileId(4)]: noul((T_LOW + T_HIGH) / 2),
        [kindId(4)]: kind('figure', 0.9),
    };
    const decision = decide(candidates, answers);

    assert.ok(decision.answered);
    assert.deepEqual(
        decision.refusals.map(({ pointer, quote, kind: named }) => [pointer, quote, named]),
        [
            ['/content', 'Norway gives the most.', 'ranking'],
            ['/content', 'ODA fell.', 'volatile'],
            ['/content', 'It rose.', 'volatile'],
        ],
    );

    for (const refusal of decision.refusals) {
        assert.equal(content.slice(refusal.start, refusal.end), refusal.quote);
        assert.equal(refusal.reason, REASONS[refusal.kind]);
    }

    assert.deepEqual(
        decision.doubts.map(({ pointer, start, end }) => [pointer, start, end]),
        [['/content', 64, 74]],
    );
});

test('a missing or mistyped answer leaves the decision unanswered', () => {
    const candidates = candidatesOf({ title: 'ODA by donor' });
    const cases: Record<string, unknown>[] = [
        {},
        { [volatileId(0)]: noul(0.1) },
        { [kindId(0)]: kind('figure', 1) },
        { [volatileId(0)]: kind('figure', 1), [kindId(0)]: kind('figure', 1) },
        { [volatileId(0)]: noul(1.5), [kindId(0)]: kind('figure', 1) },
        { [volatileId(0)]: noul(0.1), [kindId(0)]: noul(0.1) },
    ];

    for (const answers of cases) {
        assert.deepEqual(decide(candidates, answers), { answered: false }, JSON.stringify(answers));
    }
});

test('an edit checks only the text fields it changes', () => {
    const stored = {
        title: 'ODA by donor',
        description: 'Annual ODA.',
        contentTitle: null,
        content: 'Norway gives the most.',
    };

    assert.deepEqual(changedText(stored, { ...stored }), {});
    assert.deepEqual(
        changedText(stored, {
            ...stored,
            description: 'Annual ODA, by donor.',
            contentTitle: 'Reading it',
            content: null,
        }),
        { description: 'Annual ODA, by donor.', contentTitle: 'Reading it' },
    );
});
