import assert from 'node:assert/strict';
import test from 'node:test';

import { clarifyFromFrame, type Clarify } from '../clarify.ts';
import {
    answerText,
    arrowTarget,
    digitPick,
    railLabel,
    recordAnswer,
    reopen,
    startStepper,
    stepperAnswers,
    stepperRail,
    tabStopId,
    type Stepper,
} from '../clarifyStepper.ts';

const question = (id: string, skippable = true) => ({
    id,
    question: `Question ${id}?`,
    input: 'single_select' as const,
    options: [
        { id: `${id}-a`, label: `${id} A` },
        { id: `${id}-b`, label: `${id} B` },
    ],
    allow_free_text: true,
    skippable,
});

const clarifyOf = (...questions: ReturnType<typeof question>[]): Clarify =>
    clarifyFromFrame({
        event: 'elicitation.request',
        seq: 1,
        interrupt_id: 'int-1',
        questions,
        skippable: false,
    });

const three = clarifyOf(question('q1'), question('q2'), question('q3'));

const pick = (clarify: Clarify, stepper: Stepper, optionId: string): Stepper =>
    recordAnswer(clarify, stepper, { kind: 'option', option_id: optionId });

test('answers open the questions in order, then the check step', () => {
    let stepper = startStepper();

    assert.equal(stepper.open, 0);
    stepper = pick(three, stepper, 'q1-a');
    assert.equal(stepper.open, 1);
    assert.deepEqual(stepperRail(three, stepper), { before: [0], after: [] });
    assert.equal(stepperAnswers(three, stepper), null);

    stepper = recordAnswer(three, stepper, { kind: 'skipped' });
    assert.equal(stepper.open, 2);
    stepper = recordAnswer(three, stepper, { kind: 'text', text: '  grants only  ' });

    assert.equal(stepper.open, null);
    assert.equal(stepper.checking, true);
    assert.deepEqual(stepperRail(three, stepper), { before: [0, 1, 2], after: [] });
    assert.deepEqual(stepperAnswers(three, stepper), {
        q1: { kind: 'option', option_id: 'q1-a' },
        q2: { kind: 'skipped' },
        q3: { kind: 'text', text: 'grants only' },
    });
});

test('a reopened question shows answers on both sides and a new pick returns to the check step', () => {
    let stepper = startStepper();

    for (const id of ['q1-a', 'q2-a', 'q3-a']) {
        stepper = pick(three, stepper, id);
    }

    stepper = reopen(three, stepper, 1);
    assert.equal(stepper.open, 1);
    assert.deepEqual(stepperRail(three, stepper), { before: [0], after: [2] });

    stepper = pick(three, stepper, 'q2-b');
    assert.equal(stepper.open, null);
    assert.deepEqual(stepper.answers.q2, { kind: 'option', option_id: 'q2-b' });
});

test('reopening an earlier question before the check step wraps to the unanswered one', () => {
    let stepper = pick(three, startStepper(), 'q1-a');

    stepper = reopen(three, stepper, 0);
    assert.deepEqual(stepperRail(three, stepper), { before: [], after: [] });

    stepper = pick(three, stepper, 'q1-b');
    assert.equal(stepper.open, 1);
});

test('blank text, a disallowed skip and an unanswered reopen leave the stepper unchanged', () => {
    const strict = clarifyOf(question('q1', false), question('q2'));
    const stepper = startStepper();

    assert.equal(recordAnswer(strict, stepper, { kind: 'text', text: '   ' }), stepper);
    assert.equal(recordAnswer(strict, stepper, { kind: 'skipped' }), stepper);
    assert.equal(reopen(strict, stepper, 1), stepper);
});

test('the rail shows the option label, the typed text, or Skipped', () => {
    const [first] = three.questions;

    assert.ok(first);
    assert.equal(answerText(first, { kind: 'option', option_id: 'q1-b' }), 'q1 B');
    assert.equal(answerText(first, { kind: 'text', text: 'grants only' }), 'grants only');
    assert.equal(answerText(first, { kind: 'skipped' }), 'Skipped');
});

test('a rail row is named for the question and the answer it holds', () => {
    const [first, second] = three.questions;

    assert.ok(first && second);
    assert.equal(
        railLabel(first, { kind: 'option', option_id: 'q1-b' }),
        'Change your answer to Question q1?, now q1 B',
    );
    assert.equal(
        railLabel(second, { kind: 'skipped' }),
        'Change your answer to Question q2?, now Skipped',
    );
});

test('the Tab stop is the focused option, else the checked one, else the first', () => {
    const ids = ['a', 'b', 'c'];

    assert.equal(tabStopId(ids, null, null), 'a');
    assert.equal(tabStopId(ids, null, 'c'), 'c');
    assert.equal(tabStopId(ids, 'b', 'c'), 'b');
    assert.equal(tabStopId(ids, 'gone', 'gone'), 'a');
    assert.equal(tabStopId([], null, null), undefined);
});

test('arrow keys move focus round the options and other keys do not', () => {
    assert.equal(arrowTarget('ArrowDown', 1, 3), 2);
    assert.equal(arrowTarget('ArrowDown', 2, 3), 0);
    assert.equal(arrowTarget('ArrowUp', 0, 3), 2);
    assert.equal(arrowTarget('ArrowRight', 0, 3), 1);
    assert.equal(arrowTarget('ArrowLeft', 0, 3), 2);
    assert.equal(arrowTarget('Tab', 0, 3), null);
    assert.equal(arrowTarget('ArrowDown', 0, 0), null);
});

test('a digit picks its option once per press, and a held key picks nothing more', () => {
    assert.equal(digitPick('1', false, 3), 0);
    assert.equal(digitPick('3', false, 3), 2);
    assert.equal(digitPick('1', true, 3), null);
    assert.equal(digitPick('4', false, 3), null);
    assert.equal(digitPick('0', false, 3), null);
    assert.equal(digitPick('a', false, 3), null);
});
