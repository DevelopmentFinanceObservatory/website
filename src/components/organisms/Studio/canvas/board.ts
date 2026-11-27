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

// ---- scrolling the view to rest

// The studio's easing curve (`--ws-ease`) as control points.
const EASE: readonly [number, number, number, number] = [0.22, 1, 0.36, 1];

// The cubic-bezier's y at progress `x`, by bisection on its x curve.
const ease = (x: number): number => {
    const [x1, y1, x2, y2] = EASE;
    const at = (t: number, a: number, b: number) =>
        3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
    let low = 0;
    let high = 1;

    for (let step = 0; step < 24; step += 1) {
        const mid = (low + high) / 2;

        if (at(mid, x1, x2) < x) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return at((low + high) / 2, y1, y2);
};

// The studio's one clock for a move (`--ws-dur`), in ms.
const glideMs = (scroller: HTMLElement): number => {
    const value = getComputedStyle(scroller).getPropertyValue('--ws-dur').trim();

    return value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000 || 900;
};

// Frames the sheet's height must hold, and the longest wait (ms), before a
// reduced-motion move goes.
const SETTLE_FRAMES = 3;
const SETTLE_MAX_MS = 400;

const gliding = new WeakMap<HTMLElement, () => void>();

/**
 * Scrolls the view to `left` and `top` the way the studio moves things: one
 * eased glide over `--ws-dur`, in one direction, or at once under reduced
 * motion (once the sheet has settled) or with behavior `instant`. A new glide takes over from a
 * running one, and a wheel, touch, key or press from the reader ends it.
 * The target is held inside the scroll range as the range changes.
 */
export const scrollView = (scroller: HTMLElement, options: ScrollToOptions): void => {
    gliding.get(scroller)?.();
    gliding.delete(scroller);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (options.behavior === 'instant') {
        scroller.scrollTo({ ...options, behavior: 'auto' });

        return;
    }

    const fromLeft = scroller.scrollLeft;
    const fromTop = scroller.scrollTop;
    const toLeft = options.left ?? fromLeft;
    const toTop = options.top ?? fromTop;
    const duration = glideMs(scroller);
    const start = performance.now();
    let frame = 0;
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const stop = () => {
        cancelAnimationFrame(frame);
        events.forEach((name) => scroller.removeEventListener(name, stop));

        if (gliding.get(scroller) === stop) {
            gliding.delete(scroller);
        }
    };
    // Reduced motion: no glide, but the move waits until the sheet's height
    // has held still for SETTLE_FRAMES frames (a card takes its derived
    // height a frame after it lands), so it goes once, straight to its rest.
    let height = scroller.scrollHeight;
    let still = 0;
    const step = (now: number) => {
        if (reduced) {
            still = scroller.scrollHeight === height ? still + 1 : 0;
            height = scroller.scrollHeight;

            if (still < SETTLE_FRAMES && now - start < SETTLE_MAX_MS) {
                frame = requestAnimationFrame(step);

                return;
            }
        }

        const progress = reduced ? 1 : Math.min(1, (now - start) / duration);
        const eased = ease(progress);
        const maxLeft = scroller.scrollWidth - scroller.clientWidth;
        const maxTop = scroller.scrollHeight - scroller.clientHeight;

        scroller.scrollTo({
            left: fromLeft + (Math.min(toLeft, maxLeft) - fromLeft) * eased,
            top: fromTop + (Math.min(toTop, maxTop) - fromTop) * eased,
            behavior: 'auto',
        });

        if (progress < 1) {
            frame = requestAnimationFrame(step);
        } else {
            stop();
        }
    };

    events.forEach((name) => scroller.addEventListener(name, stop, { passive: true }));
    gliding.set(scroller, stop);
    frame = requestAnimationFrame(step);
};
