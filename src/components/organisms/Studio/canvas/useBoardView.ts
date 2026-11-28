'use client';

import { type RefObject, useEffect, useState } from 'react';

import { type BoardView, scrollerOf } from './board';

const sameView = (a: BoardView, b: BoardView): boolean =>
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height &&
    a.overhang === b.overhang;

/**
 * The board's frame of reference: the live view rectangle (rAF-throttled
 * scroll position + size — anchors the off-screen beacons and sizes
 * newcomer auto-placement) and the origin offset that lands this sheet's
 * grid on the same screen lines as the static pattern it covers, so the
 * mount swap is pixel-invisible.
 */
export const useBoardView = (
    boardRef: RefObject<HTMLDivElement | null>,
    CELL: number,
    // False when the sheet's grid starts at its own frame's corner (no
    // pattern beneath it to line up with): the origin stays at 0, 0.
    alignToPage = true,
) => {
    const [view, setView] = useState<BoardView>({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        overhang: 0,
    });
    const [origin, setOrigin] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const scroller = scrollerOf(boardRef);

        if (!scroller) {
            return undefined;
        }

        let raf = 0;
        const update = () => {
            raf = 0;
            const next: BoardView = {
                left: scroller.scrollLeft,
                top: scroller.scrollTop,
                width: scroller.clientWidth,
                height: scroller.clientHeight,
                overhang: Math.max(
                    0,
                    Math.round(scroller.getBoundingClientRect().bottom - window.innerHeight),
                ),
            };

            // The same values keep the same state, so a scroll event that
            // moved nothing (a glide's frames past its end) renders nothing.
            setView((prev) => (sameView(prev, next) ? prev : next));
        };
        const schedule = () => {
            if (!raf) {
                raf = requestAnimationFrame(update);
            }
        };

        schedule();
        scroller.addEventListener('scroll', schedule, { passive: true });
        const observer = new ResizeObserver(schedule);

        observer.observe(scroller);

        return () => {
            scroller.removeEventListener('scroll', schedule);
            observer.disconnect();
            cancelAnimationFrame(raf);
        };
    }, [boardRef]);

    // Re-measured whenever the fluid cell changes (a resize rescales both
    // patterns); adding the scroll offset back keeps the measurement
    // scroll-independent.
    useEffect(() => {
        if (!alignToPage) {
            return undefined;
        }

        const frame = requestAnimationFrame(() => {
            const el = boardRef.current;

            if (el) {
                const rect = el.getBoundingClientRect();
                const scroller = el.parentElement;
                const left = rect.left + (scroller?.scrollLeft ?? 0);
                const top = rect.top + (scroller?.scrollTop ?? 0);

                setOrigin({
                    x: (CELL - (left % CELL)) % CELL,
                    y: (CELL - (top % CELL)) % CELL,
                });
            }
        });

        return () => cancelAnimationFrame(frame);
    }, [CELL, boardRef, alignToPage]);

    // View width in cells — keeps AUTO-placed newcomers inside the visible
    // window; it never reflows what's already placed.
    const viewCols = view.width ? Math.max(10, Math.floor(view.width / CELL) - 1) : 0;

    return { view, origin, viewCols };
};
