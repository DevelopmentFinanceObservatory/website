import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    type Coming,
    comingNotice,
    ghostLabel,
    type Ghosts,
    ghostSpan,
    placeGhosts,
    titledGhosts,
} from '../../../components/organisms/Studio/canvas/comingGhosts.ts';
import type { Slots } from '../../../components/organisms/Studio/canvas/layout.ts';
import { placeSlots } from '../../../components/organisms/Studio/canvas/placeSlots.ts';
import type { Widget } from '../../chat/widgets.ts';

const line = (id: string, turn = 1): Coming => ({
    id,
    type: 'line_chart',
    title: id,
    turn,
    stepId: 's1',
});

const stat = (id: string, placeholderId: string | null, turn = 1): Widget =>
    ({ kind: 'key_number', id, label: id, value: '1', turn, placeholderId }) as Widget;

const ghosts = (
    coming: Coming[],
    current: Ghosts = {},
    slots: Slots = {},
    claimed = new Set<string>(),
    now = 0,
) => placeGhosts({ current, coming, claimed, slots, cols: 60, placement: 'blocks', now });

describe('placeGhosts', () => {
    it('stands each announced card at its kind footprint, clear of the others', () => {
        const placed = ghosts([line('a'), { ...line('b'), type: 'stat_card' }]);

        assert.deepEqual(
            [placed['a']?.w, placed['a']?.h, placed['b']?.w, placed['b']?.h],
            [ghostSpan('line_chart').w, ghostSpan('line_chart').h, 20, 9],
        );
        assert.notDeepEqual(
            [placed['a']?.col, placed['a']?.row],
            [placed['b']?.col, placed['b']?.row],
        );
    });

    it('keeps a standing placeholder where it is when the list grows', () => {
        const first = ghosts([line('a')]);
        const second = ghosts([line('a'), line('b')], first, {}, new Set(), 1000);

        assert.equal(second['a'], first['a']);
    });

    it('drops a placeholder whose card landed and fades one whose line ended with no card', () => {
        const both = ghosts([line('a'), line('b')]);
        const after = ghosts([line('b')], both, {}, new Set(['a']), 1000);

        assert.equal(after['a'], undefined);
        assert.equal(after['b']?.leaving, undefined);

        const failed = ghosts([], both, {}, new Set(), 1000);

        assert.equal(failed['a']?.leaving, true);
        assert.equal(failed['b']?.leaving, true);
    });
});

describe('a placeholder announced before a card leaves', () => {
    const old = placeSlots(
        {},
        {
            widgets: [stat('old', null, 1)],
            pinnedIds: [],
            views: {},
            cols: 60,
            placement: 'blocks',
            nextZ: () => 1,
        },
    );
    const leaving: Slots = { old: { ...old['old']!, leaving: true } };

    it('moves up into the place the card leaves, while it is new', () => {
        const below = ghosts([line('a', 2)], {}, old);
        const after = ghosts([line('a', 2)], below, leaving, new Set(), 100);

        assert.ok(below['a']!.row > after['a']!.row);
        assert.equal(after['a']!.at, 0);
    });

    it('stays where it is once it has settled', () => {
        const below = ghosts([line('a', 2)], {}, old);

        assert.equal(ghosts([line('a', 2)], below, leaving, new Set(), 1000)['a'], below['a']);
    });
});

describe('a card that names a placeholder', () => {
    const standing = ghosts([{ ...line('a'), type: 'stat_card' }, line('b')]);
    const land = (widgets: Widget[]) =>
        placeSlots(
            {},
            {
                widgets,
                pinnedIds: [],
                views: {},
                cols: 60,
                placement: 'blocks',
                nextZ: () => 1,
                ghosts: standing,
            },
        );

    it('takes its rect', () => {
        const slots = land([stat('c1', 'a')]);

        assert.deepEqual(
            [slots['c1']?.col, slots['c1']?.row, slots['c1']?.w, slots['c1']?.h],
            [standing['a']?.col, standing['a']?.row, standing['a']?.w, standing['a']?.h],
        );
    });

    it('leaves the placeholders no card names clear for a card that names none', () => {
        const slots = land([stat('s1', null)]);
        const card = slots['s1']!;
        const clear = (ghost: Ghosts[string]) =>
            card.col >= ghost.col + ghost.w + 1 ||
            ghost.col >= card.col + card.w + 1 ||
            card.row >= ghost.row + ghost.h + 1 ||
            ghost.row >= card.row + card.h + 1;

        assert.ok(Object.values(standing).every(clear));
    });
});

describe('labels and notices', () => {
    it('names the kind in the panel words, and a planned card with no kind', () => {
        assert.equal(ghostLabel('line_chart'), 'Line chart · drawing');
        assert.equal(ghostLabel('stat_card'), 'Key number · drawing');
        assert.equal(ghostLabel(null), 'Planned');
    });

    it('shows titles only where two placeholders share a label', () => {
        const same = titledGhosts([
            { id: 'a', type: 'line_chart' },
            { id: 'b', type: 'line_chart' },
            { id: 'c', type: 'table' },
        ]);

        assert.deepEqual([...same].sort(), ['a', 'b']);
    });

    it('announces a batch once, by its kinds', () => {
        assert.equal(
            comingNotice([{ type: 'line_chart' }, { type: 'bar_chart' }]),
            '2 charts on the way',
        );
        assert.equal(comingNotice([{ type: 'stat_card' }]), '1 key number on the way');
        assert.equal(
            comingNotice([{ type: 'table' }, { type: 'stat_card' }]),
            '2 cards on the way',
        );
        assert.equal(comingNotice([{ type: null }, { type: null }]), '2 cards planned');
    });
});
