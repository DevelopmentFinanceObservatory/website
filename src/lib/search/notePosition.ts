/**
 * Where a fixed side note goes: beside its panel at the height of the mark
 * that opened it, on the right, else on the left, else (a narrow screen
 * with no room either side) under the mark, else over it. The note then
 * moves inside the screen's margins, so no edge clips it.
 */

export type Box = { top: number; right: number; bottom: number; left: number };
export type Size = { width: number; height: number };

// The note's distance from what it sits beside, and its distance from the
// screen's edges.
export const NOTE_GAP = 8;
export const SCREEN_MARGIN = 16;

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(value, max));

export const notePosition = ({
    panel,
    mark,
    note,
    screen,
}: {
    panel: Box;
    mark: Box;
    note: Size;
    screen: Size;
}): { top: number; left: number } => {
    const maxLeft = screen.width - SCREEN_MARGIN - note.width;
    const maxTop = screen.height - SCREEN_MARGIN - note.height;
    const right = panel.right + NOTE_GAP;
    const left = panel.left - NOTE_GAP - note.width;

    if (right <= maxLeft) {
        return { left: right, top: clamp(mark.top, SCREEN_MARGIN, maxTop) };
    }

    if (left >= SCREEN_MARGIN) {
        return { left, top: clamp(mark.top, SCREEN_MARGIN, maxTop) };
    }

    const below = mark.bottom + NOTE_GAP;
    const above = mark.top - NOTE_GAP - note.height;

    return {
        left: clamp(mark.left, SCREEN_MARGIN, maxLeft),
        top: clamp(below <= maxTop || above < SCREEN_MARGIN ? below : above, SCREEN_MARGIN, maxTop),
    };
};

/** Whether a note renders, which it does not while the styles hide it
 *  (`display: none` on it or an ancestor, as on a coarse pointer).
 *  `checkVisibility` answers that where the browser has it (Safari 17.4
 *  and later); elsewhere a rendered element has at least one layout box,
 *  and a hidden or detached one has none. */
export const noteShown = (
    note: Pick<Element, 'getClientRects'> & { checkVisibility?: () => boolean },
): boolean =>
    typeof note.checkVisibility === 'function'
        ? note.checkVisibility()
        : note.getClientRects().length > 0;
