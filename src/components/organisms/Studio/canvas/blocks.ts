// Relative .ts imports, so the node test runner loads this module as it is.
import type { Widget } from '../../../../lib/chat/widgets.ts';
import { findSpot, type Rect, type Slots, type Spot, tooCloseRects } from './layout.ts';

/**
 * Block placement for the Prompt variant: each question's cards land in a
 * block of their own, the blocks running down the sheet in the order the
 * questions were asked. No block is stored. A newcomer's block is read off
 * the live slots as a row floor for `findSpot`, so a saved layout, a drag,
 * a resize or a pin needs no special case, and the order holds at arrival
 * only.
 */

// The first block starts this many cells under the sheet's top, and every
// block keeps this many cells clear at its left and right.
export const BLOCK_INSET = 1;
// Empty cells between one block's lowest card and the next block's top.
export const BLOCK_GAP = 2;

export type Placement = 'pack' | 'blocks';

/**
 * The question a card answers: the page turn it arrived in. A text card has
 * none, and a fork's inherited card carries a turn below 1; each of those
 * arrives as a block of its own.
 */
export const questionTurn = (widget: Widget): number | null =>
    'turn' in widget && typeof widget.turn === 'number' && widget.turn >= 1 ? widget.turn : null;

const live = (slots: Slots) => Object.values(slots).filter((slot) => !slot.leaving);

/**
 * The first row a newcomer of `turn` may take: the top of its question's live
 * cards, or, when that question has none on the sheet, BLOCK_GAP cells below
 * every live card. An empty sheet starts BLOCK_INSET cells down.
 */
export const blockFloor = (turn: number | null, slots: Slots): number => {
    const cards = live(slots);
    const own = turn === null ? [] : cards.filter((slot) => questionTurn(slot.widget) === turn);

    if (own.length > 0) {
        return Math.min(...own.map((slot) => slot.row));
    }

    if (cards.length === 0) {
        return BLOCK_INSET;
    }

    return Math.max(...cards.map((slot) => slot.row + slot.h)) + BLOCK_GAP;
};

/**
 * The columns a newcomer may reach in a view `width` px wide, of which the
 * right `reserveRight` px are about to go to the session panel. The last
 * BLOCK_INSET column stays clear. Zero before the view is measured.
 */
export const blockCols = (width: number, reserveRight: number, cell: number): number =>
    width ? Math.max(10, Math.floor((width - reserveRight) / cell) - BLOCK_INSET) : 0;

/**
 * Where a newcomer lands. A saved rect is honoured while it is free, whatever
 * the placement, so a layout saved under either variant opens as it was
 * saved; a taken one goes to the nearest free spot (`nearest`). A fresh card
 * takes the first free spot from the corner (`pack`), or from its block's
 * floor inside the insets (`blocks`).
 */
export const newcomerSpot = ({
    widget,
    w,
    h,
    saved,
    occupied,
    slots,
    cols,
    placement,
    nearest,
}: {
    widget: Widget;
    w: number;
    h: number;
    saved: Spot | null;
    occupied: Rect[];
    // Every slot placed so far, this batch's newcomers included.
    slots: Slots;
    cols: number;
    placement: Placement;
    nearest: (spot: Spot) => Spot | null;
}): Spot => {
    const fresh = () =>
        placement === 'blocks'
            ? findSpot(w, h, occupied, cols, {
                  col: BLOCK_INSET,
                  row: blockFloor(questionTurn(widget), slots),
              })
            : findSpot(w, h, occupied, cols);

    if (!saved) {
        return fresh();
    }

    return occupied.some((rect) => tooCloseRects({ ...saved, w, h }, rect))
        ? (nearest(saved) ?? fresh())
        : saved;
};

/**
 * The top row of the block a fresh arrival belongs to, and whether the block
 * is new: no card of its question was on the sheet before this batch.
 */
export const arrivalBlock = (
    newest: Rect & { widget: Widget },
    slots: Slots,
    fresh: ReadonlySet<string>,
): { top: number; isNew: boolean } => {
    const turn = questionTurn(newest.widget);

    if (turn === null) {
        return { top: newest.row, isNew: true };
    }

    const own = Object.entries(slots).filter(
        ([, slot]) => !slot.leaving && questionTurn(slot.widget) === turn,
    );

    return {
        top: Math.min(newest.row, ...own.map(([, slot]) => slot.row)),
        isNew: own.every(([id]) => fresh.has(id)),
    };
};

/**
 * The scroll offset along one axis that shows the span `start`..`end` (board
 * px) in a view running from `scroll` for `size` px, of which the last
 * `hidden` px sit under something (the prompt). Null when the span shows
 * already. A span longer than the view shows its start, `lead` px in.
 */
export const revealOffset = ({
    start,
    end,
    scroll,
    size,
    hidden = 0,
    lead,
}: {
    start: number;
    end: number;
    scroll: number;
    size: number;
    hidden?: number;
    lead: number;
}): number | null => {
    const room = size - hidden;

    if (start >= scroll && end <= scroll + room) {
        return null;
    }

    if (start < scroll || end - start > room) {
        return Math.max(0, start - lead);
    }

    return Math.max(0, end - room);
};

/**
 * The view's foot that the floating prompt covers, in px: the 20 px gap under
 * the resting prompt, the resting prompt, and 20 px of air above it. `rest`
 * is `--dock-rest` as the dock writes it on the shell root.
 */
export const promptFoot = (rest: string): number => {
    const px = Number.parseFloat(rest);

    return 20 + (Number.isFinite(px) ? px : 0) + 20;
};
