import assert from 'node:assert/strict';
import test from 'node:test';

import { clarifyFromFrame } from '../clarify.ts';
import type { ElicitationRequest } from '../wire.ts';

/** A minimal well-formed elicitation frame, overridden per test. */
function frame(fields: Partial<ElicitationRequest>): ElicitationRequest {
    return {
        event: 'elicitation.request',
        seq: 1,
        interrupt_id: 'int-1',
        question: 'Which measure?',
        input: 'single_select',
        allow_free_text: true,
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
    assert.deepEqual(clarify.options, [
        { id: 'opt-a', label: 'A', description: 'the A one', recommended: false },
        { id: 'opt-b', label: 'B', description: null, recommended: false },
    ]);
});

test('a text frame with no candidates has an empty options list', () => {
    const clarify = clarifyFromFrame(frame({ input: 'text', options: null }));

    assert.deepEqual(clarify.options, []);
});

test('progress passes through when present', () => {
    const clarify = clarifyFromFrame(frame({ progress: { completed: 1, total: 3 } }));

    assert.deepEqual(clarify.progress, { completed: 1, total: 3 });
});

test('progress is null when the frame carries none', () => {
    const clarify = clarifyFromFrame(frame({}));

    assert.equal(clarify.progress, null);
});

test('a recommended option keeps its flag, and rationale passes through', () => {
    const clarify = clarifyFromFrame(
        frame({
            options: [{ id: 'opt-a', label: 'A', recommended: true }],
            rationale: 'A matches the most recent period.',
        }),
    );

    assert.equal(clarify.options[0]?.recommended, true);
    assert.equal(clarify.rationale, 'A matches the most recent period.');
});

test('rationale is null when the frame carries none', () => {
    const clarify = clarifyFromFrame(frame({}));

    assert.equal(clarify.rationale, null);
});

test('a frame with no options, no free text and no skip falls back to text', () => {
    const clarify = clarifyFromFrame(
        frame({ options: null, allow_free_text: false, skippable: false }),
    );

    assert.equal(clarify.showText, true);
});

test('a frame with no options but skippable hides text', () => {
    const clarify = clarifyFromFrame(
        frame({ options: null, allow_free_text: false, skippable: true }),
    );

    assert.equal(clarify.showText, false);
});

test('a frame with options and allow_free_text false hides text', () => {
    const clarify = clarifyFromFrame(
        frame({
            options: [{ id: 'opt-a', label: 'A' }],
            allow_free_text: false,
            skippable: false,
        }),
    );

    assert.equal(clarify.showText, false);
});

test('a text-input frame shows text regardless of allow_free_text', () => {
    const clarify = clarifyFromFrame(frame({ input: 'text', allow_free_text: false }));

    assert.equal(clarify.showText, true);
});

test('allow_free_text true always shows text', () => {
    const clarify = clarifyFromFrame(
        frame({
            options: [{ id: 'opt-a', label: 'A' }],
            allow_free_text: true,
            skippable: true,
        }),
    );

    assert.equal(clarify.showText, true);
});
