import assert from 'node:assert/strict';
import test from 'node:test';

import { clarifyFromFrame, multiAnswer } from '../clarify.ts';
import type { ElicitationQuestion, ElicitationRequest, LegacyElicitationRequest } from '../wire.ts';

/** A minimal well-formed question, overridden per test. */
function question(fields: Partial<ElicitationQuestion>): ElicitationQuestion {
    return {
        id: 'q1',
        question: 'Which measure?',
        input: 'single_select',
        allow_free_text: true,
        ...fields,
    };
}

/** A one-question frame whose question and pause flags are overridden per test. */
function frame(
    fields: Partial<ElicitationQuestion>,
    pause: Partial<ElicitationRequest> = { skippable: true },
): ElicitationRequest {
    return {
        event: 'elicitation.request',
        seq: 1,
        interrupt_id: 'int-1',
        questions: [question(fields)],
        ...pause,
    };
}

/** A legacy single-question frame, overridden per test. */
function legacy(fields: Partial<LegacyElicitationRequest>): LegacyElicitationRequest {
    return {
        event: 'elicitation.request',
        seq: 1,
        interrupt_id: 'int-1',
        question: 'Which measure?',
        input: 'single_select',
        allow_free_text: false,
        skippable: true,
        ...fields,
    };
}

test('an options frame carries its options through, normalized', () => {
    const clarify = clarifyFromFrame(
        frame({
            options: [
                { id: 'opt-a', label: 'A', description: 'the A one' },
                { id: 'opt-b', label: 'B' },
            ],
        }),
    );

    assert.equal(clarify.interruptId, 'int-1');
    assert.equal(clarify.legacy, false);
    assert.deepEqual(clarify.questions[0]?.options, [
        { id: 'opt-a', label: 'A', description: 'the A one', recommended: false },
        { id: 'opt-b', label: 'B', description: null, recommended: false },
    ]);
});

test('several questions keep their ids, order and per-question flags', () => {
    const clarify = clarifyFromFrame({
        event: 'elicitation.request',
        seq: 4,
        interrupt_id: 'int-2',
        questions: [
            question({ id: 'q1', question: 'Count?', skippable: true }),
            question({ id: 'q2', question: 'Prices?', skippable: true, rationale: 'Why.' }),
        ],
        skippable: false,
    });

    assert.deepEqual(
        clarify.questions.map((q) => [q.id, q.question, q.skippable, q.rationale]),
        [
            ['q1', 'Count?', true, null],
            ['q2', 'Prices?', true, 'Why.'],
        ],
    );
    assert.equal(clarify.skippable, false);
});

test('absent question flags and pause skippable read as false', () => {
    const clarify = clarifyFromFrame({
        event: 'elicitation.request',
        seq: 1,
        interrupt_id: 'int-1',
        questions: [{ id: 'q1', question: 'Which?', input: 'single_select' }],
    });

    assert.equal(clarify.skippable, false);
    assert.equal(clarify.questions[0]?.skippable, false);
    assert.equal(clarify.questions[0]?.allowFreeText, false);
});

test('a text frame with no candidates has an empty options list', () => {
    const clarify = clarifyFromFrame(frame({ input: 'text', options: null }));

    assert.deepEqual(clarify.questions[0]?.options, []);
});

test('progress passes through when present, else null', () => {
    assert.deepEqual(
        clarifyFromFrame(frame({}, { progress: { completed: 1, total: 3 } })).progress,
        { completed: 1, total: 3 },
    );
    assert.equal(clarifyFromFrame(frame({})).progress, null);
});

test('a recommended option keeps its flag, and rationale passes through', () => {
    const clarify = clarifyFromFrame(
        frame({
            options: [{ id: 'opt-a', label: 'A', recommended: true }],
            rationale: 'A matches the most recent period.',
        }),
    );

    assert.equal(clarify.questions[0]?.options[0]?.recommended, true);
    assert.equal(clarify.questions[0]?.rationale, 'A matches the most recent period.');
});

test('showText follows input, free text and whether the question can be passed', async (t) => {
    const cases: [string, ElicitationRequest, boolean][] = [
        [
            'no options, no free text, no skip falls back to text',
            frame({ options: null, allow_free_text: false }, { skippable: false }),
            true,
        ],
        [
            'no options but the pause is skippable hides text',
            frame({ options: null, allow_free_text: false }, { skippable: true }),
            false,
        ],
        [
            'no options but the question is skippable hides text',
            frame({ options: null, allow_free_text: false, skippable: true }, { skippable: false }),
            false,
        ],
        [
            'options and allow_free_text false hide text',
            frame(
                { options: [{ id: 'opt-a', label: 'A' }], allow_free_text: false },
                { skippable: false },
            ),
            false,
        ],
        [
            'a text-input question shows text regardless of allow_free_text',
            frame({ input: 'text', allow_free_text: false }),
            true,
        ],
        [
            'a multi-select question shows text even with allow_free_text false, so it has a Send',
            frame(
                {
                    input: 'multi_select',
                    options: [{ id: 'opt-a', label: 'A' }],
                    allow_free_text: false,
                },
                { skippable: false },
            ),
            true,
        ],
        [
            'allow_free_text true always shows text',
            frame({ options: [{ id: 'opt-a', label: 'A' }], allow_free_text: true }),
            true,
        ],
    ];

    for (const [name, input, expected] of cases) {
        await t.test(name, () => {
            assert.equal(clarifyFromFrame(input).questions[0]?.showText, expected);
        });
    }
});

test('a legacy frame reads as one question q1, marked legacy', () => {
    const clarify = clarifyFromFrame(
        legacy({
            options: [{ id: 'opt-a', label: 'A', recommended: true }],
            rationale: 'Because.',
            progress: { completed: 2, total: 2 },
        }),
    );

    assert.deepEqual(clarify, {
        interruptId: 'int-1',
        questions: [
            {
                id: 'q1',
                question: 'Which measure?',
                options: [{ id: 'opt-a', label: 'A', description: null, recommended: true }],
                allowFreeText: false,
                skippable: false,
                multi: false,
                showText: false,
                rationale: 'Because.',
            },
        ],
        skippable: true,
        progress: { completed: 2, total: 2 },
        legacy: true,
    });
});

test('a legacy frame with no options and no skip falls back to text', () => {
    const clarify = clarifyFromFrame(legacy({ options: null, skippable: false }));

    assert.equal(clarify.questions[0]?.showText, true);
});

test('a legacy multi_select frame stays single-select', () => {
    const [only] = clarifyFromFrame(
        legacy({ input: 'multi_select', options: [{ id: 'opt-a', label: 'A' }] }),
    ).questions;

    assert.equal(only?.multi, false);
    assert.equal(
        clarifyFromFrame(frame({ input: 'multi_select', options: [{ id: 'opt-a', label: 'A' }] }))
            .questions[0]?.multi,
        true,
    );
});

test('a multi-select Send folds ticks and typed text into one text answer', async (t) => {
    const [multi] = clarifyFromFrame(
        frame({
            input: 'multi_select',
            options: [
                { id: 'a', label: 'A' },
                { id: 'b', label: 'B' },
            ],
        }),
    ).questions;

    assert.ok(multi);

    const cases: [string, string, string[], unknown][] = [
        ['ticks alone', '', ['a', 'b'], { kind: 'options', option_ids: ['a', 'b'] }],
        ['text alone', ' C ', [], { kind: 'text', text: 'C' }],
        ['two ticks and text', 'C', ['a', 'b'], { kind: 'text', text: 'A; B; and C' }],
        ['one tick and text', 'C', ['a'], { kind: 'text', text: 'A; and C' }],
    ];

    for (const [name, text, ticked, expected] of cases) {
        await t.test(name, () => {
            assert.deepEqual(multiAnswer(multi, text, ticked), expected);
        });
    }
});
