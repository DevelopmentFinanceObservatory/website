'use client';

import { type RefObject, useEffect, useRef } from 'react';

import { type BoardView, scrollerOf } from './board';
import { type CardView, effectiveKind, FILTER_KIND, type Slots } from './layout';

type UseFilterFlyArgs = {
    boardRef: RefObject<HTMLDivElement | null>;
    filter?: string;
    slots: Slots;
    views: Record<string, CardView>;
    origin: { x: number; y: number };
    view: BoardView;
    CELL: number;
    // Kills a lingering pan glide before the flight.
    stopGlide: () => void;
};

/**
 * Picking a filter flies to the nearest matching card (from the view's
 * centre) — unless one is already in view, in which case nothing moves.
 */
export const useFilterFly = ({
    boardRef,
    filter,
    slots,
    views,
    origin,
    view,
    CELL,
    stopGlide,
}: UseFilterFlyArgs) => {
    const lastFilterRef = useRef(filter);

    useEffect(() => {
        if (filter === lastFilterRef.current) {
            return;
        }

        lastFilterRef.current = filter;

        const kind = filter ? FILTER_KIND[filter] : undefined;
        const scroller = scrollerOf(boardRef);

        if (!kind || !scroller || !view.width) {
            return;
        }

        const viewCx = scroller.scrollLeft + view.width / 2;
        const viewCy = scroller.scrollTop + view.height / 2;
        const matching = Object.values(slots)
            .filter(
                (slot) =>
                    !slot.leaving && effectiveKind(slot.widget, views[slot.widget.id]) === kind,
            )
            .map((slot) => {
                const left = origin.x + slot.col * CELL;
                const top = origin.y + slot.row * CELL;
                const w = slot.w * CELL;
                const h = slot.h * CELL;
                const cx = left + w / 2;
                const cy = top + h / 2;
                const inView =
                    left >= scroller.scrollLeft &&
                    top >= scroller.scrollTop &&
                    left + w <= scroller.scrollLeft + view.width &&
                    top + h <= scroller.scrollTop + view.height;

                return { cx, cy, inView, dist: Math.hypot(cx - viewCx, cy - viewCy) };
            });

        if (!matching.length || matching.some((m) => m.inView)) {
            return;
        }

        const nearest = matching.reduce((best, m) => (m.dist < best.dist ? m : best));

        stopGlide();
        scroller.scrollTo({
            left: nearest.cx - view.width / 2,
            top: nearest.cy - view.height / 2,
            behavior: 'smooth',
        });
    }, [filter, slots, views, origin, view.width, view.height, CELL, boardRef, stopGlide]);
};
