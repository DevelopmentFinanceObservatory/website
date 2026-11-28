import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    arrivalBlock,
    blockCols,
    type Placement,
    promptFoot,
    revealOffset,
} from '../../../components/organisms/Studio/canvas/blocks.ts';
import type { Slots } from '../../../components/organisms/Studio/canvas/layout.ts';
import {
    placeSlots,
    type PlaceSlotsArgs,
} from '../../../components/organisms/Studio/canvas/placeSlots.ts';
import type { CardLayout } from '../../chat/history.ts';
import type { KeyNumberWidget, TextWidget, Widget } from '../../chat/widgets.ts';

// A stat card spawns at a fixed 20 by 9 cells, so the spots below follow
// from the placement rule alone.
const stat = (id: string, turn: number): KeyNumberWidget & { turn: number } => ({
    kind: 'key_number',
    id,
    label: id,
    value: '1',
    turn,
});

const note: TextWidget = { kind: 'text', id: 'note', title: 'Note', body: 'Kept' };

const place = (
    widgets: Widget[],
    placement: Placement,
    current: Slots = {},
    extra: Partial<PlaceSlotsArgs> = {},
): Slots => {
    let z = 1;

    return placeSlots(current, {
        widgets,
        pinnedIds: [],
        views: {},
        cols: 60,
        placement,
        nextZ: () => z++,
        ...extra,
    });
};

const rect = (slots: Slots, id: string) => {
    const slot = slots[id];

    assert.ok(slot, `no slot for ${id}`);

    return { col: slot.col, row: slot.row, w: slot.w, h: slot.h };
};

const bottom = (slots: Slots, ids: string[]) =>
    Math.max(...ids.map((id) => slots[id]!.row + slots[id]!.h));

describe('block placement', () => {
    const a1 = stat('a1', 1);
    const a2 = stat('a2', 1);
    const b1 = stat('b1', 2);

    it('starts the first block one cell down and one cell in', () => {
        const slots = place([a1], 'blocks');

        assert.deepEqual(rect(slots, 'a1'), { col: 1, row: 1, w: 20, h: 9 });
    });

    it('packs from the corner when the placement is pack', () => {
        const slots = place([a1, a2, b1], 'pack');

        assert.deepEqual(rect(slots, 'a1'), { col: 0, row: 0, w: 20, h: 9 });
        assert.deepEqual(rect(slots, 'a2'), { col: 21, row: 0, w: 20, h: 9 });
    });

    it("puts a question's next card in its block", () => {
        const first = place([a1], 'blocks');
        const slots = place([a1, a2], 'blocks', first);

        assert.equal(rect(slots, 'a2').row, rect(slots, 'a1').row);
        assert.ok(rect(slots, 'a2').col > rect(slots, 'a1').col);
    });

    it('starts a new question two cells below every card on the sheet', () => {
        const first = place([a1, a2], 'blocks');
        const slots = place([a1, a2, b1], 'blocks', first);

        assert.equal(rect(slots, 'b1').row, bottom(slots, ['a1', 'a2']) + 2);
        assert.equal(rect(slots, 'b1').col, 1);
    });

    it('starts the new block below a card the reader dragged down', () => {
        const first = place([a1], 'blocks');
        const dragged: Slots = { a1: { ...first.a1!, col: 30, row: 40 } };
        const slots = place([a1, b1], 'blocks', dragged);

        assert.equal(rect(slots, 'b1').row, 40 + 9 + 2);
    });

    it('places a text card and an inherited fork card each as a block of its own', () => {
        const forked = stat('fork', 0);
        const first = place([a1], 'blocks');
        const withNote = place([a1, note], 'blocks', first);
        const slots = place([a1, note, forked], 'blocks', withNote);

        assert.equal(rect(slots, 'note').row, bottom(slots, ['a1']) + 2);
        assert.equal(rect(slots, 'fork').row, bottom(slots, ['a1', 'note']) + 2);
    });

    it('ignores a card that is fading out', () => {
        const first = place([a1], 'blocks');
        const slots = place([b1], 'blocks', first);

        assert.equal(slots.a1?.leaving, true);
        assert.deepEqual(rect(slots, 'b1'), { col: 1, row: 1, w: 20, h: 9 });
    });

    it('keeps the replaced card’s slot for its replacement', () => {
        const first = place([a1, a2], 'blocks');
        const moved: Slots = { ...first, a1: { ...first.a1!, col: 7, row: 30 } };
        const swapped = stat('a1-new', 1);
        const slots = place([swapped, a2], 'blocks', moved, { replacedIds: { 'a1-new': 'a1' } });

        assert.deepEqual(rect(slots, 'a1-new'), rect(moved, 'a1'));
        assert.equal(slots.a1, undefined);
    });
});

describe('a saved layout', () => {
    const widgets = [stat('a1', 1), stat('a2', 1), stat('b1', 2)];
    // Rects no placement rule would choose.
    const saved: CardLayout = {
        a1: { col: 3, row: 30, w: 20, h: 9 },
        a2: { col: 40, row: 2, w: 22, h: 9 },
        b1: { col: 3, row: 4, w: 20, h: 9 },
    };

    for (const placement of ['pack', 'blocks'] as const) {
        it(`opens as saved under ${placement}`, () => {
            const slots = place(widgets, placement, {}, { initialLayout: saved });

            for (const [id, want] of Object.entries(saved)) {
                assert.deepEqual(rect(slots, id), want);
            }
        });
    }
});

describe('arrivalBlock', () => {
    it('tells a new block from a card joining one', () => {
        const before = place([stat('a1', 1)], 'blocks');
        const joined = place([stat('a1', 1), stat('a2', 1)], 'blocks', before);
        const opened = place([stat('a1', 1), stat('b1', 2)], 'blocks', before);

        assert.deepEqual(arrivalBlock(joined.a2!, joined, new Set(['a2'])), {
            top: 1,
            isNew: false,
        });
        assert.deepEqual(arrivalBlock(opened.b1!, opened, new Set(['b1'])), {
            top: opened.b1!.row,
            isNew: true,
        });
    });
});

describe('blockCols', () => {
    it('places against the width left once the panel opens', () => {
        assert.equal(blockCols(1200, 0, 20), 59);
        assert.equal(blockCols(1200, 290, 20), 44);
        assert.equal(blockCols(0, 290, 20), 0);
    });
});

describe('revealOffset', () => {
    const view = { scroll: 100, size: 500, hidden: 120, lead: 20 };

    it('leaves a span that shows above the prompt', () => {
        assert.equal(revealOffset({ ...view, start: 120, end: 470 }), null);
    });

    it('scrolls just far enough to lift a span clear of the prompt', () => {
        assert.equal(revealOffset({ ...view, start: 300, end: 600 }), 220);
    });

    it('shows the start of a span above the view, or one taller than the room', () => {
        assert.equal(revealOffset({ ...view, start: 50, end: 150 }), 30);
        assert.equal(revealOffset({ ...view, start: 300, end: 800 }), 280);
    });
});

describe('promptFoot', () => {
    it('adds the gaps above and below the resting prompt', () => {
        assert.equal(promptFoot('96px'), 136);
        assert.equal(promptFoot(''), 40);
    });
});
