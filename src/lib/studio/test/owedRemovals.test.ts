/**
 * `owedRemovals.ts`: the harness cards the user took off whose removal the
 * harness has not confirmed. Add takes a card out of the set, and a canvas
 * settles the removals it confirms.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { canvasWidgetsOf } from '../../chat/canvas.ts';
import type { CanvasBaseline } from '../composition.ts';
import { forgive, owe, owedRemovalsOf, removalsToSend, settle } from '../owedRemovals.ts';

const card = (id: string) => ({ kind: 'text' as const, id, title: id, body: '', turn: 1 });

const baseline = (ids: string[]): CanvasBaseline => ({
    compositionId: 'cps_1',
    revision: 3,
    ids,
    pinned: [],
});

test('Add takes a card out of the owed set, so it shows and no remove goes for it', () => {
    const canvas = baseline(['cmp_a', 'cmp_x']);
    const owed = owe([], 'cmp_x', 1);
    const shown = (owedRemovals: typeof owed) =>
        canvasWidgetsOf({
            widgets: [card('cmp_a'), card('cmp_x')],
            pinnedIds: [],
            removedIds: [],
            canvas,
            owedRemovals,
        }).map((widget) => widget.id);

    assert.deepEqual(shown(owed), ['cmp_a']);
    assert.deepEqual(removalsToSend(owed, canvas, new Set()), ['cmp_x']);

    const added = forgive(owed, 'cmp_x');

    assert.deepEqual(shown(added), ['cmp_a', 'cmp_x']);
    assert.deepEqual(removalsToSend(added, canvas, new Set()), []);
    // A removal owed already keeps the revision it was owed at.
    assert.deepEqual(owe(owed, 'cmp_x', 4), owed);
});

test('a canvas settles the removals it confirms, and a card drawn again since', () => {
    const owed = [
        { id: 'cmp_gone', revision: 1 },
        { id: 'cmp_held', revision: 1 },
        { id: 'cmp_redrawn', revision: 1 },
        { id: 'cmp_unknown', revision: null },
    ];
    const canvas = baseline(['cmp_held', 'cmp_redrawn', 'cmp_unknown']);
    const revisions = new Map([
        ['cmp_held', 1],
        ['cmp_redrawn', 2],
        ['cmp_unknown', 5],
    ]);

    assert.deepEqual(
        settle(owed, canvas, revisions).map((entry) => entry.id),
        ['cmp_held', 'cmp_unknown'],
    );
    // A legacy canvas and none settle nothing, and send nothing.
    const legacy = { compositionId: null, revision: -1, ids: [] };

    assert.equal(settle(owed, legacy, revisions), owed);
    assert.equal(settle(owed, null, revisions), owed);
    assert.deepEqual(removalsToSend(owed, legacy, new Set()), []);
    // A remove in flight is not sent twice.
    assert.deepEqual(removalsToSend(owed, canvas, new Set(['cmp_held'])), [
        'cmp_redrawn',
        'cmp_unknown',
    ]);
});

test("a save's own owed set wins over its removals, whatever its baseline", () => {
    const pinless = { compositionId: 'cps_1', revision: 2, ids: ['cmp_x'] };

    assert.deepEqual(owedRemovalsOf({ canvas: pinless, removedIds: ['cmp_x'] }), [
        { id: 'cmp_x', revision: null },
    ]);
    assert.deepEqual(
        owedRemovalsOf({ canvas: pinless, removedIds: ['cmp_x'], owedRemovals: [] }),
        [],
    );
    // A save with pins that lists a harness card among its removals owes
    // nothing: its page kept harness removals in the manifest.
    assert.deepEqual(owedRemovalsOf({ canvas: baseline(['cmp_x']), removedIds: ['cmp_x'] }), []);
});
