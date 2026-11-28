'use client';

import { type RefObject, useEffect, useRef } from 'react';

import { arrivalToShow } from './blocks';
import { scrollerOf, scrollView } from './board';
import type { Rect, Slot, Slots } from './layout';

type UseArrivalsArgs = {
    boardRef: RefObject<HTMLDivElement | null>;
    slots: Slots;
    origin: { x: number; y: number };
    CELL: number;
    spawnWave: (centerCol: number, centerRow: number, exclude?: Rect) => void;
    // The user is mid-drag / mid-pan: the view must not jump under them.
    busy: () => boolean;
    // Where the view goes for an arrival, replacing the minimal scroll below:
    // null leaves it. Reads the batch's ids so it can tell a new block.
    placeView?: (
        newest: Slot,
        fresh: ReadonlySet<string>,
        scroller: HTMLElement,
    ) => ScrollToOptions | null;
    // A card that took its placeholder's place. The view already moved to the
    // placeholder, and the placeholder marked the place, so neither the view
    // nor the wave moves.
    quiet?: (newest: Slot) => boolean;
};

/**
 * Every freshly placed card, except one seated in its placeholder
 * (`quiet`), announces itself: the surrounding grid cells
 * flare in a sweep, and the view scrolls (smoothly, minimally) until the
 * card sits comfortably inside — unless the user is busy dragging or
 * panning right now. Runs post-commit, so the sheet has already grown and
 * the scroll bounds are real.
 */
export const useArrivals = ({
    boardRef,
    slots,
    origin,
    CELL,
    spawnWave,
    busy,
    placeView,
    quiet,
}: UseArrivalsArgs) => {
    const seenRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const fresh = Object.entries(slots).filter(
            ([id, slot]) => !slot.leaving && !seenRef.current.has(id),
        );

        for (const [id] of fresh) {
            seenRef.current.add(id);
        }

        const newest = fresh[fresh.length - 1]?.[1];

        if (!newest) {
            return;
        }

        // The wave and the view go to the newest card not seated in a
        // placeholder, which marked its place before it came.
        const shown = arrivalToShow(
            fresh.map(([, slot]) => slot),
            quiet,
        );

        if (shown) {
            spawnWave(shown.col + shown.w / 2, shown.row + shown.h / 2, shown);
        }

        const scroller = scrollerOf(boardRef);

        if (!scroller || busy() || !shown) {
            return;
        }

        if (placeView) {
            const target = placeView(shown, new Set(fresh.map(([id]) => id)), scroller);

            if (target) {
                scrollView(scroller, target);
            }

            return;
        }

        const margin = 40;
        const x = origin.x + newest.col * CELL;
        const y = origin.y + newest.row * CELL;
        const cardRight = x + newest.w * CELL;
        const cardBottom = y + newest.h * CELL;
        let { scrollLeft: left, scrollTop: top } = scroller;

        if (x < left + margin) {
            left = Math.max(0, x - margin);
        } else if (cardRight > left + scroller.clientWidth - margin) {
            left = cardRight + margin - scroller.clientWidth;
        }

        if (y < top + margin) {
            top = Math.max(0, y - margin);
        } else if (cardBottom > top + scroller.clientHeight - margin) {
            top = cardBottom + margin - scroller.clientHeight;
        }

        if (left !== scroller.scrollLeft || top !== scroller.scrollTop) {
            scroller.scrollTo({ left, top, behavior: 'smooth' });
        }
        // spawnWave/busy/placeView only read refs and the DOM; slots (and the
        // origin) are the real trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slots, origin]);
};
