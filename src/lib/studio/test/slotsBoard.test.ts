import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { arrivalToShow } from '../../../components/organisms/Studio/canvas/blocks.ts';
import type { Coming } from '../../../components/organisms/Studio/canvas/comingGhosts.ts';
import {
    EMPTY_BOARD,
    placeBoard,
    pruneBoard,
    updateSlots,
} from '../../../components/organisms/Studio/canvas/slotsBoard.ts';
import type { KeyNumberWidget, Widget } from '../../chat/widgets.ts';

const stat = (id: string, placeholderId?: string): Widget =>
    ({ kind: 'key_number', id, label: id, value: '1', turn: 1, placeholderId }) as KeyNumberWidget &
        Widget;

const stands: Coming = { id: 'p1', type: 'stat_card', title: 'p1', turn: 1, stepId: 's1' };

const place = (board = EMPTY_BOARD, widgets: Widget[] = [], coming: Coming[] = [], now = 0) =>
    placeBoard(board, {
        widgets,
        pinnedIds: [],
        views: {},
        cols: 60,
        placement: 'blocks',
        nextZ: () => 1,
        coming,
        now,
    });

describe('the board takes every change as an update of itself', () => {
    it('keeps a card fit that lands between two placements', () => {
        const first = place(EMPTY_BOARD, [stat('a')]);
        const fit = updateSlots(first, (slots) => ({
            ...slots,
            a: { ...slots['a']!, h: slots['a']!.h + 3 },
        }));
        const second = place(fit, [stat('a'), stat('b')]);

        assert.equal(second.slots['a']?.h, first.slots['a']!.h + 3);
        assert.ok(second.slots['b']);
    });

    it('would lose the fit if a placement started from a board that missed it', () => {
        const first = place(EMPTY_BOARD, [stat('a')]);
        const fit = updateSlots(first, (slots) => ({
            ...slots,
            a: { ...slots['a']!, h: slots['a']!.h + 3 },
        }));
        const stale = place(first, [stat('a'), stat('b')]);

        assert.equal(fit.slots['a']!.h, first.slots['a']!.h + 3);
        assert.equal(stale.slots['a']!.h, first.slots['a']!.h);
    });

    it('keeps a placement that lands between two fits', () => {
        const first = place(EMPTY_BOARD, [stat('a')]);
        const placed = place(first, [stat('a'), stat('b')]);
        const fit = updateSlots(placed, (slots) => ({
            ...slots,
            a: { ...slots['a']!, h: 20 },
        }));

        assert.ok(fit.slots['b']);
        assert.equal(fit.slots['a']?.h, 20);
    });
});

describe('the cards seated in a standing placeholder', () => {
    const standing = place(EMPTY_BOARD, [], [stands]);

    it('are reported once, and the placeholder goes with them', () => {
        const landed = place(standing, [stat('c1', 'p1')], [], 1000);

        assert.deepEqual([...landed.claimed], ['c1']);
        assert.deepEqual(Object.keys(landed.ghosts), []);
    });

    it('are not reported for a placeholder that never stood', () => {
        assert.equal(place(EMPTY_BOARD, [stat('c1', 'p1')]).claimed.size, 0);
    });

    it('are not reported for a card put back that names a placeholder long gone', () => {
        const landed = place(standing, [stat('c1', 'p1')], [], 1000);
        const removed = place(landed, [], [], 2000);
        const restored = place(pruneBoard(removed), [stat('c1', 'p1')], [], 3000);

        assert.equal(restored.claimed.size, 0);
    });
});

describe('the card of a batch the view moves to', () => {
    const seated = new Set(['b']);
    const quiet = (id: string) => seated.has(id);

    it('is the newest card not seated in a placeholder, though the newest is seated', () => {
        assert.equal(arrivalToShow(['a', 'b'], quiet), 'a');
    });

    it('is the newest card when none is seated, and none when all are', () => {
        assert.equal(arrivalToShow(['a', 'c']), 'c');
        assert.equal(arrivalToShow(['b'], quiet), null);
    });
});
