import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    clarifyAnswer,
    clarifyFromFrame,
    clarifyNote,
    clarifyReply,
    type Clarify,
} from '../clarify.ts';
import { recordAnswer, startStepper, stepperAnswers } from '../clarifyStepper.ts';
import type { ElicitationRequest, InterruptResponse } from '../wire.ts';

const options = [
    { id: 'net', label: 'Net disbursements' },
    { id: 'gross', label: 'Gross disbursements' },
];

/** Two questions, each skippable alone, as the orchestrator asks them. */
const several: Clarify = clarifyFromFrame({
    event: 'elicitation.request',
    seq: 1,
    interrupt_id: 'int-1',
    questions: [
        { id: 'q1', question: 'Count?', input: 'single_select', options, skippable: true },
        { id: 'q2', question: 'Prices?', input: 'single_select', options, skippable: true },
    ],
    skippable: false,
});

/** One question whose only skip is the whole pause. */
const single: Clarify = clarifyFromFrame({
    event: 'elicitation.request',
    seq: 1,
    interrupt_id: 'int-1',
    questions: [{ id: 'q1', question: 'Count?', input: 'single_select', options }],
    skippable: true,
});

const legacy: Clarify = clarifyFromFrame({
    event: 'elicitation.request',
    seq: 1,
    interrupt_id: 'int-1',
    question: 'Count?',
    input: 'single_select',
    options,
    allow_free_text: true,
    skippable: true,
});

test('a current frame replies with one answer per question, text trimmed', () => {
    const reply = clarifyReply(several, {
        q1: { kind: 'option', option_id: 'net' },
        q2: { kind: 'text', text: '  constant 2023 dollars ' },
    });

    assert.deepEqual(reply, {
        decision: 'answer',
        answers: {
            q1: { kind: 'option', option_id: 'net' },
            q2: { kind: 'text', text: 'constant 2023 dollars' },
        },
    });
});

test('a skippable question may be answered with skipped', () => {
    const reply = clarifyReply(several, {
        q1: { kind: 'skipped' },
        q2: { kind: 'option', option_id: 'gross' },
    });

    assert.deepEqual(reply.answers?.q1, { kind: 'skipped' });
});

test('a one-question frame replies with answers too', () => {
    assert.deepEqual(clarifyReply(single, { q1: { kind: 'option', option_id: 'gross' } }), {
        decision: 'answer',
        answers: { q1: { kind: 'option', option_id: 'gross' } },
    });
});

test('a legacy frame replies with payload: option id, typed text, or a whole-pause skip', () => {
    assert.deepEqual(clarifyReply(legacy, { q1: { kind: 'option', option_id: 'net' } }), {
        decision: 'answer',
        payload: 'net',
    });
    assert.deepEqual(clarifyReply(legacy, { q1: { kind: 'text', text: ' mine ' } }), {
        decision: 'answer',
        payload: 'mine',
    });
    assert.deepEqual(clarifyReply(legacy, { q1: { kind: 'skipped' } }), { decision: 'skip' });
});

test('answers the harness would refuse throw', async (t) => {
    const cases: [string, Clarify, Parameters<typeof clarifyReply>[1]][] = [
        ['a missing answer', several, { q1: { kind: 'option', option_id: 'net' } }],
        [
            'an unknown question id',
            single,
            { q1: { kind: 'option', option_id: 'net' }, q9: { kind: 'skipped' } },
        ],
        [
            'an option the question does not offer',
            single,
            { q1: { kind: 'option', option_id: 'x' } },
        ],
        ['empty text', single, { q1: { kind: 'text', text: '   ' } }],
        ['a skip on a question that is not skippable', single, { q1: { kind: 'skipped' } }],
    ];

    for (const [name, clarify, answers] of cases) {
        await t.test(name, () => {
            assert.throws(() => clarifyReply(clarify, answers));
        });
    }
});

test('the note lists answered labels and typed text in question order', () => {
    assert.equal(
        clarifyNote(several, {
            q1: { kind: 'option', option_id: 'net' },
            q2: { kind: 'text', text: ' constant ' },
        }),
        'You chose: Net disbursements, constant',
    );
    assert.equal(
        clarifyNote(several, {
            q1: { kind: 'skipped' },
            q2: { kind: 'option', option_id: 'gross' },
        }),
        'You chose: Gross disbursements',
    );
});

test('the note reads Left to DFO when every question was skipped', () => {
    assert.equal(
        clarifyNote(several, { q1: { kind: 'skipped' }, q2: { kind: 'skipped' } }),
        'Left to DFO',
    );
});

test('skipping every question sends the reply without a transcript answer', () => {
    let stepper = startStepper();

    stepper = recordAnswer(several, stepper, { kind: 'skipped' });
    stepper = recordAnswer(several, stepper, { kind: 'skipped' });

    const answers = stepperAnswers(several, stepper);

    assert.ok(answers);
    assert.deepEqual(clarifyReply(several, answers), { decision: 'answer', answers });
    assert.equal(clarifyNote(several, answers), 'Left to DFO');
    assert.equal(clarifyAnswer(several, answers), undefined);
});

test('a selected option among skipped questions keeps its transcript answer', () => {
    assert.equal(
        clarifyAnswer(several, {
            q1: { kind: 'skipped' },
            q2: { kind: 'option', option_id: 'gross' },
        }),
        'You chose: Gross disbursements',
    );
});

test("typing the skip status text still records the user's words", () => {
    assert.equal(
        clarifyAnswer(single, { q1: { kind: 'text', text: 'Left to DFO' } }),
        'Left to DFO',
    );
});

test('the note for one question answered in own words is the text alone', () => {
    assert.equal(
        clarifyNote(single, { q1: { kind: 'text', text: ' grants only ' } }),
        'grants only',
    );
    assert.equal(
        clarifyNote(single, { q1: { kind: 'option', option_id: 'net' } }),
        'You chose: Net disbursements',
    );
});

/**
 * The harness's wire fixtures (`services/harness/tests/wire_fixtures/studio`
 * in dfo-ai), copied: the frame the harness sends for two questions and the
 * reply it accepts. A change to either side breaks this test.
 */
const fixture = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('the card answers the harness fixture frame with the fixture reply', () => {
    const frame = fixture('event-14-elicitation-questions.json') as ElicitationRequest;
    const request = fixture('request-12-interrupt-answers.json') as InterruptResponse;
    const clarify = clarifyFromFrame(frame);
    const chosen = clarify.questions[0]?.options[1];

    assert.ok(chosen);
    assert.equal(clarify.interruptId, request.interrupt_id);

    let stepper = startStepper();

    stepper = recordAnswer(clarify, stepper, { kind: 'option', option_id: chosen.id });
    stepper = recordAnswer(clarify, stepper, { kind: 'skipped' });

    const answers = stepperAnswers(clarify, stepper);

    assert.ok(answers);
    assert.deepEqual(clarifyReply(clarify, answers), {
        decision: request.decision,
        answers: request.answers,
    });
});
