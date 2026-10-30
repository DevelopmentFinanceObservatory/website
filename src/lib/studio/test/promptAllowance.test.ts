/**
 * The `studio.prompt` event and the guest limit every Studio prompt passes:
 * typed text and clicked chips alike.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GUEST_PROMPTS, promptEvent } from '../promptAllowance.ts';

test('promptEvent: a guest with no free prompt left sends nothing, queued prompts included', () => {
    assert.equal(promptEvent({ guest: true, used: GUEST_PROMPTS, queued: 0, sent: 3 }), null);
    assert.equal(
        promptEvent({
            guest: true,
            used: GUEST_PROMPTS - 1,
            queued: 1,
            sent: 3,
            intent: 'apply_choice',
        }),
        null,
    );
});

test('promptEvent: a signed-in user is never walled', () => {
    assert.deepEqual(promptEvent({ guest: false, used: 99, queued: 2, sent: 7, length: 12 }), {
        turn: 10,
        intent: 'follow_up',
        length: 12,
        guest: false,
    });
});

test('promptEvent: the first prompt is new, a later one a follow-up, unless an intent is given', () => {
    assert.equal(promptEvent({ guest: true, used: 0, queued: 0, sent: 0 })?.intent, 'new');
    assert.equal(promptEvent({ guest: true, used: 1, queued: 0, sent: 1 })?.intent, 'follow_up');
    assert.equal(
        promptEvent({ guest: true, used: 1, queued: 0, sent: 1, intent: 'edit' })?.intent,
        'edit',
    );
});

test('promptEvent: a chip counts as a turn, with its intent and no length', () => {
    assert.deepEqual(
        promptEvent({ guest: true, used: 1, queued: 1, sent: 1, intent: 'apply_choice' }),
        { turn: 3, intent: 'apply_choice', guest: true },
    );
});
