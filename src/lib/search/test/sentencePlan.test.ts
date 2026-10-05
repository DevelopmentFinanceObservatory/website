import assert from 'node:assert/strict';
import test from 'node:test';

import { earlySentenceTokens, planSentenceText, tokenPart } from '../sentencePlan.ts';
import { crs038, mls037 } from './fixtures/sentence-panel.ts';
import type { SentenceToken } from '../types.ts';

const text = (value: string): SentenceToken => ({ kind: 'text', text: value, segment: 'heading' });
const slot = (value: string): SentenceToken => ({
    kind: 'slot',
    axis: 'what',
    text: value,
    segment: 'heading',
});

// ---------------------------------------------------------------------------
// tokenPart
// ---------------------------------------------------------------------------

test('tokenPart routes every token of a one-part response to part 0, whatever the plan stamps', () => {
    const plan = [
        { ...slot('ODA'), part_index: 0 },
        text(' of '),
        { ...slot('Kenya'), part_index: 1 },
    ];

    assert.deepEqual(
        plan.map((token) => tokenPart(token, 1)),
        [0, 0, 0],
    );
});

test('tokenPart shares an unstamped token across a several-part response -- crs-048', () => {
    // crs-048 "aid to Kenya and Uganda for health and education", two
    // definite parts: the joined heading stamped 0, the year and byline
    // unstamped.
    const plan: SentenceToken[] = [
        {
            kind: 'slot',
            text: 'Gross ODA disbursements',
            axis: 'what',
            segment: 'heading',
            part_index: 0,
        },
        { kind: 'text', text: ' to ', segment: 'heading', part_index: 0 },
        {
            kind: 'slot',
            text: 'Kenya and Uganda',
            axis: 'where',
            segment: 'heading',
            binding_ref: 'where:',
            part_index: 0,
        },
        { kind: 'text', text: ', ', segment: 'heading', part_index: null },
        {
            kind: 'slot',
            text: '1990 to 2024',
            axis: 'when',
            segment: 'heading',
            binding_ref: 'when:',
            part_index: null,
        },
        { kind: 'text', text: '.', segment: 'heading', part_index: null },
        {
            kind: 'slot',
            text: 'Current US dollars',
            axis: 'unit',
            segment: 'byline',
            binding_ref: 'unit:',
            part_index: null,
        },
        {
            kind: 'slot',
            text: 'OECD Creditor Reporting System (CRS)',
            axis: 'source',
            segment: 'byline',
            part_index: null,
        },
    ];

    assert.deepEqual(
        plan.map((token) => tokenPart(token, 2)),
        [0, 0, 0, null, null, null, null, null],
    );
});

// ---------------------------------------------------------------------------
// earlySentenceTokens -- when to switch, and the per-part concatenation
// ---------------------------------------------------------------------------

test('earlySentenceTokens is null until at least one expected part has a plan', () => {
    assert.equal(earlySentenceTokens(2, [null, null]), null);
    assert.equal(earlySentenceTokens(2, []), null);
    assert.equal(earlySentenceTokens(0, []), null);
});

test('earlySentenceTokens skips a part with no plan yet, keeping the rest in order', () => {
    const tokens = earlySentenceTokens(3, [
        [slot('Population of Kenya.')],
        null,
        [slot('GDP of Kenya.')],
    ]);

    assert.ok(tokens);
    assert.deepEqual(
        tokens!.map((token) => token.text),
        ['Population of Kenya.', ' ', 'GDP of Kenya.'],
    );
});

test('earlySentenceTokens concatenates every part in order, space-joined', () => {
    // Each part's own plan already carries its terminal "." on its last
    // token's own text, the same as a real per-part sentence_plan.
    const tokens = earlySentenceTokens(2, [
        [slot('Population of Kenya.')],
        [slot('GDP of Kenya.')],
    ]);

    assert.ok(tokens);
    assert.deepEqual(
        tokens!.map((token) => token.text),
        ['Population of Kenya.', ' ', 'GDP of Kenya.'],
    );
});

test('earlySentenceTokens stamps every token with its own part index, the connector null', () => {
    const tokens = earlySentenceTokens(2, [[slot('Population')], [slot('GDP')]])!;

    assert.deepEqual(
        tokens.map((token) => tokenPart(token, 2)),
        [0, null, 1],
    );
});

test('planSentenceText reads the heading alone, leaving out the byline and departures', () => {
    assert.equal(
        planSentenceText(crs038.sentence_plan),
        "United Kingdom's ODA commitments to India, 1973 to 2024.",
    );
    assert.equal(
        planSentenceText(mls037.sentence_plan),
        '"education" names a category the search could not apply to this query. ' +
            "Denmark's gross ODA disbursements to 42 recipients for health, 2015 to 2024.",
    );
    assert.equal(planSentenceText(null), '');
});
