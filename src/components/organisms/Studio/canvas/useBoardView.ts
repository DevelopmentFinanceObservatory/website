'use client';

import { type RefObject, useEffect, useState } from 'react';

import { type BoardView, scrollerOf } from './board';

/**
 * The board's frame of reference: the live view rectangle (rAF-throttled
 * scroll position + size — anchors the off-screen beacons and sizes
 * newcomer auto-placement) and the origin offset that lands this sheet's
 * grid on the same screen lines as the static pattern it covers, so the
 * mount swap is pixel-invisible.
 */
export const useBoardView = (boardRef: RefObject<HTMLDivElement | null>, CELL: number) => {
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
            setView({
                left: scroller.scrollLeft,
                top: scroller.scrollTop,
                width: scroller.clientWidth,
                height: scroller.clientHeight,
                overhang: Math.max(
                    0,
                    Math.round(scroller.getBoundingClientRect().bottom - window.innerHeight),
                ),
            });
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
    }, [CELL, boardRef]);

    // View width in cells — keeps AUTO-placed newcomers inside the visible
    // window; it never reflows what's already placed.
    const viewCols = view.width ? Math.max(10, Math.floor(view.width / CELL) - 1) : 0;

    return { view, origin, viewCols };
};
