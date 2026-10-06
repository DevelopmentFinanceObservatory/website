import assert from 'node:assert/strict';
import test from 'node:test';

import { awaitingEntityOptions, awaitingSlotOptions } from '../menuState.ts';
import type { EntityOptionsEntry, SlotOptionsEntry } from '../view.ts';

const emptyOptionsEntry: SlotOptionsEntry = { options: [], truncated: false };

test('awaitingSlotOptions is true only when the frame is missing and the base stream is still open', () => {
    const bySpec: Record<string, Record<string, SlotOptionsEntry>> = {
        'spec-1': { 'how:crsPurpose': emptyOptionsEntry },
    };

    // No entry at all for this key yet, stream still open: waiting.
    assert.equal(awaitingSlotOptions(bySpec, 'spec-1', 'what:measure', true), true);
    // Same missing entry, stream closed: nothing more is coming.
    assert.equal(awaitingSlotOptions(bySpec, 'spec-1', 'what:measure', false), false);
    // A confirmed-empty entry already arrived: never "awaiting", even mid-stream.
    assert.equal(awaitingSlotOptions(bySpec, 'spec-1', 'how:crsPurpose', true), false);
});

test('awaitingEntityOptions distinguishes "not arrived" from "arrived empty"', () => {
    const arrivedEmpty: EntityOptionsEntry = { role: 'origin', options: [], truncated: false };

    assert.equal(awaitingEntityOptions(undefined, true), true);
    assert.equal(awaitingEntityOptions(undefined, false), false);
    assert.equal(awaitingEntityOptions(arrivedEmpty, true), false);
});
