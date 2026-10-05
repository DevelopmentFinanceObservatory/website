'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { scrollerOf } from './board';

/**
 * Grab-the-background panning: the empty sheet (cards included — only truly
 * interactive bits keep the pointer) drags the view around. The view eases
 * toward the grab point viscously while held, and glides out on decaying
 * momentum after release. `flyTo` scrolls smoothly to a board point,
 * killing any lingering glide first (its frame loop would fight the flight).
 */
const PAN_FOLLOW = 0.25;
const PAN_DECAY = 0.92;

export const usePan = (boardRef: RefObject<HTMLDivElement | null>) => {
    const [panning, setPanning] = useState(false);
    // Pointer + scroll offsets at pan start, the eased target while held,
    // and the glide velocity after release.
    const startRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
    const targetRef = useRef<{ x: number; y: number } | null>(null);
    const velRef = useRef({ x: 0, y: 0 });
    const rafRef = useRef(0);
    // Distinguishes a plain click on the sheet (→ test shockwave) from the
    // tail end of a pan — and remembers whether the press landed on a card
    // (pointer capture retargets the click to the board, so the click's own
    // target can't tell).
    const movedRef = useRef(false);
    const fromCardRef = useRef(false);

    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    const frame = () => {
        const scroller = scrollerOf(boardRef);

        if (!scroller) {
            rafRef.current = 0;

            return;
        }

        const target = targetRef.current;

        if (target) {
            const nextX = scroller.scrollLeft + (target.x - scroller.scrollLeft) * PAN_FOLLOW;
            const nextY = scroller.scrollTop + (target.y - scroller.scrollTop) * PAN_FOLLOW;

            velRef.current = {
                x: nextX - scroller.scrollLeft,
                y: nextY - scroller.scrollTop,
            };
            scroller.scrollTo(nextX, nextY);
        } else {
            velRef.current = {
                x: velRef.current.x * PAN_DECAY,
                y: velRef.current.y * PAN_DECAY,
            };

            if (Math.abs(velRef.current.x) < 0.3 && Math.abs(velRef.current.y) < 0.3) {
                rafRef.current = 0;

                return;
            }

            scroller.scrollBy(velRef.current.x, velRef.current.y);
        }

        rafRef.current = requestAnimationFrame(frame);
    };

    const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
        // Panning starts anywhere on the sheet — cards included. Only truly
        // interactive bits (pin button, beacons, inputs; the grab bar stops
        // propagation itself) keep the pointer to themselves.
        if (
            (event.target as HTMLElement).closest(
                'button, a, input, textarea, select, [data-beacon]',
            )
        ) {
            return;
        }

        event.preventDefault();

        // A press on a chart's canvas is NOT captured: capture would retarget
        // the tap's `click` to the board and Chart.js would never see it (its
        // touch tooltip rides on click). The pan still runs off the bubbling
        // moves; it only loses the pointer if it leaves the board mid-pan.
        if (!(event.target as HTMLElement).closest('canvas')) {
            event.currentTarget.setPointerCapture(event.pointerId);
        }

        const scroller = scrollerOf(boardRef);

        startRef.current = {
            x: event.clientX,
            y: event.clientY,
            left: scroller?.scrollLeft ?? 0,
            top: scroller?.scrollTop ?? 0,
        };
        movedRef.current = false;
        fromCardRef.current = !!(event.target as HTMLElement).closest('article');
        targetRef.current = { x: startRef.current.left, y: startRef.current.top };
        velRef.current = { x: 0, y: 0 };
        setPanning(true);
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(frame);
    };

    const movePan = (event: React.PointerEvent) => {
        const start = startRef.current;

        if (start) {
            if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 5) {
                movedRef.current = true;
            }

            targetRef.current = {
                x: Math.max(0, start.left - (event.clientX - start.x)),
                y: Math.max(0, start.top - (event.clientY - start.y)),
            };
        }
    };

    const endPan = () => {
        if (!startRef.current) {
            return;
        }

        // The frame loop keeps running on momentum until it dies down.
        startRef.current = null;
        targetRef.current = null;
        setPanning(false);
    };

    // Kill a lingering glide (before a programmatic smooth scroll).
    const stopGlide = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        velRef.current = { x: 0, y: 0 };
    }, []);

    // Fly the view so that board point (cx, cy) sits in the middle.
    const flyTo = (cx: number, cy: number, viewWidth: number, viewHeight: number) => {
        stopGlide();
        scrollerOf(boardRef)?.scrollTo({
            left: cx - viewWidth / 2,
            top: cy - viewHeight / 2,
            behavior: 'smooth',
        });
    };

    return {
        panning,
        startPan,
        movePan,
        endPan,
        stopGlide,
        flyTo,
        isPanning: () => startRef.current !== null,
        // For the board's click handler: was this a pan, and did it start on
        // a card?
        panMoved: () => movedRef.current,
        panFromCard: () => fromCardRef.current,
    };
};
