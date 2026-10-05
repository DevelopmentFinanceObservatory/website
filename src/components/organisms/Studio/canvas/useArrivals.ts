'use client';

import { type RefObject, useEffect, useRef } from 'react';

import { scrollerOf } from './board';
import type { Rect, Slots } from './layout';

type UseArrivalsArgs = {
    boardRef: RefObject<HTMLDivElement | null>;
    slots: Slots;
    origin: { x: number; y: number };
    CELL: number;
    spawnWave: (centerCol: number, centerRow: number, exclude?: Rect) => void;
    // The user is mid-drag / mid-pan: the view must not jump under them.
    busy: () => boolean;
};

/**
 * Every freshly placed card announces itself: the surrounding grid cells
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

        spawnWave(newest.col + newest.w / 2, newest.row + newest.h / 2, newest);

        const scroller = scrollerOf(boardRef);

        if (!scroller || busy()) {
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
        // spawnWave/busy only touch refs; slots (and the origin) are the real trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slots, origin]);
};
