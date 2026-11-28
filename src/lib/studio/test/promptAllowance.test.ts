/**
 * The `studio.prompt` event and the guest limit every Studio prompt passes:
 * typed text and clicked chips alike.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addGuestPrompts,
    GUEST_PROMPTS,
    GUEST_PROMPTS_KEY,
    guestPromptsUsed,
    promptEvent,
} from '../promptAllowance.ts';

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

test('promptEvent: a picked example carries its source, and a typed prompt none', () => {
    for (const source of ['example', 'availability', 'search_example'] as const) {
        assert.equal(
            promptEvent({ guest: false, used: 0, queued: 0, sent: 0, length: 40, source })?.source,
            source,
        );
    }

    assert.ok(
        !('source' in promptEvent({ guest: false, used: 0, queued: 0, sent: 0, length: 4 })!),
    );
});

// Studio's own reader (Studio.tsx) writes the count under this key; Get Data
// reads it to decide whether a move to Studio would reach the guest wall.
test('guestPromptsUsed reads the count Studio stores, and 0 when there is none', () => {
    const storage = (value: string | null) => ({
        getItem: (key: string) => (key === GUEST_PROMPTS_KEY ? value : null),
    });

    assert.equal(guestPromptsUsed(storage('3')), 3);
    assert.equal(guestPromptsUsed(storage(null)), 0);
    assert.equal(guestPromptsUsed(storage('garbled')), 0);
});

// Studio counts its transcript's prompts through it, and Get Data the
// prompt of a turn it started that Studio did not adopt.
test('addGuestPrompts adds to the stored count, never takes it below 0, and leaves blocked storage alone', () => {
    const stored = new Map<string, string>();
    const storage = {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => void stored.set(key, value),
    };

    addGuestPrompts(() => storage, 1);
    assert.equal(guestPromptsUsed(storage), 1);
    addGuestPrompts(() => storage, 2);
    assert.equal(guestPromptsUsed(storage), 3);
    addGuestPrompts(() => storage, -5);
    assert.equal(guestPromptsUsed(storage), 0);
    assert.doesNotThrow(() =>
        addGuestPrompts(() => {
            throw new DOMException('blocked', 'SecurityError');
        }, 1),
    );
    assert.doesNotThrow(() =>
        addGuestPrompts(
            () => ({
                getItem: () => null,
                setItem: () => {
                    throw new DOMException('full', 'QuotaExceededError');
                },
            }),
            1,
        ),
    );
});
