/**
 * The session panel's hover growth: its timings, and the arithmetic that
 * holds one row in place across the switch between the narrow and the wide
 * layout. Pure, so the rules run under `node --test`.
 */

/** Pointer rest, or keyboard focus, before the panel grows (ms). */
export const GROW_REST_MS = 60;

/** Pointer and focus absent this long before the panel shrinks (ms). */
export const SHRINK_AFTER_MS = 220;

/** The edge's move each way (ms). The stylesheet's `--sp-edge` holds the
 *  same value. */
export const EDGE_MS = 320;

/** The dissolve's fade-out before a layout switch (ms). */
export const FADE_OUT_MS = 80;

/** How long held space takes to ease away (ms). */
export const SPACER_EASE_MS = 200;

export type RowHold = {
    /** The scroller's scrollTop after the switch. */
    scrollTop: number;
    /** Space held above the content and below it, in px. */
    top: number;
    foot: number;
};

/**
 * Where to scroll so a row stays where it was across a layout switch, and
 * the space to hold where that position falls outside the scroll range.
 * `before` is the row's top against the scroller's top before the switch;
 * `after` is the row's top in the content after it, with no space held;
 * `content` is the content's height after the switch and `viewport` the
 * scroller's. A page shorter than the panel gains only the foot space that
 * passes the panel's foot.
 */
export const holdRow = ({
    before,
    after,
    content,
    viewport,
}: {
    before: number;
    after: number;
    content: number;
    viewport: number;
}): RowHold => {
    const wanted = after - before;

    if (wanted < 0) {
        return { scrollTop: 0, top: -wanted, foot: 0 };
    }

    return { scrollTop: wanted, top: 0, foot: Math.max(0, wanted + viewport - content) };
};

/** A rectangle in viewport px. */
export type Box = { left: number; right: number; top: number; bottom: number };

/**
 * The width the panel grows to. The panel keeps its rest width unless the
 * strip the wide panel adds, from `grownLeft` to `restLeft` and across the
 * panel's height (`panel.top` to `panel.bottom`), holds no part of a card.
 * Both widths run to `right`.
 */
export const grownWidth = ({
    restLeft,
    grownLeft,
    right,
    panel,
    cards,
}: {
    restLeft: number;
    grownLeft: number;
    right: number;
    panel: Pick<Box, 'top' | 'bottom'>;
    cards: readonly Box[];
}): number => {
    const covered = cards.some(
        (card) =>
            card.right > grownLeft &&
            card.left < restLeft &&
            card.bottom > panel.top &&
            card.top < panel.bottom,
    );

    return right - (covered ? restLeft : grownLeft);
};
