import type { RefObject } from 'react';

/**
 * Small shared bits of the whiteboard's interaction layer: the scroller
 * lookup and the edge auto-scroll speed that drag and resize both use.
 */

// Auto-scroll hot zone at the scroller's edges (px) and its max speed
// (px per frame) — both scaled by the fluid factor at call time.
const SCROLL_ZONE = 60;
const SCROLL_SPEED = 14;

// The board's scroll container (the sheet lives inside .canvasContent).
export const scrollerOf = (boardRef: RefObject<HTMLDivElement | null>): HTMLElement | null =>
    boardRef.current?.parentElement ?? null;

// Edge auto-scroll speed for a pointer position: the deeper into the zone
// along an edge, the faster the sheet slides that way. (The canvas overhangs
// the window bottom, so the visible edge is what counts.)
export const edgeScrollSpeed = (
    scroller: HTMLElement | null,
    clientX: number,
    clientY: number,
    f: number,
): { x: number; y: number } => {
    if (!scroller) {
        return { x: 0, y: 0 };
    }

    const rect = scroller.getBoundingClientRect();
    const bottomEdge = Math.min(rect.bottom, window.innerHeight);
    const rightEdge = Math.min(rect.right, window.innerWidth);
    const zone = SCROLL_ZONE * f;
    const speed = SCROLL_SPEED * f;
    let speedY = 0;
    let speedX = 0;

    if (clientY > bottomEdge - zone) {
        speedY = Math.min(1, (clientY - (bottomEdge - zone)) / zone) * speed;
    } else if (clientY < rect.top + zone) {
        speedY = -Math.min(1, (rect.top + zone - clientY) / zone) * speed;
    }

    if (clientX > rightEdge - zone) {
        speedX = Math.min(1, (clientX - (rightEdge - zone)) / zone) * speed;
    } else if (clientX < rect.left + zone) {
        speedX = -Math.min(1, (rect.left + zone - clientX) / zone) * speed;
    }

    return { x: speedX, y: speedY };
};

// The live view rectangle: scroll position, size and how far the scroller
// runs past the window bottom (the canvas deliberately overhangs).
export type BoardView = {
    left: number;
    top: number;
    width: number;
    height: number;
    overhang: number;
};
