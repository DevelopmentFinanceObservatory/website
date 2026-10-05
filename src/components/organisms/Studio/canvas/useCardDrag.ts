'use client';

import {
    type Dispatch,
    type RefObject,
    type SetStateAction,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

import { edgeScrollSpeed, scrollerOf } from './board';
import {
    clamp,
    liveRects,
    MAX_COLS,
    nearestSpot,
    type Rect,
    type Slot,
    type Slots,
    type Spot,
    tooCloseRects,
} from './layout';

/**
 * Drag-to-rearrange via the hover grab bar. Heavy-object drag: mass lives
 * in POSITION, not angle — the card trails the pointer through a viscous
 * follow and catches up (FOLLOW per frame), and leans slightly AGAINST its
 * own motion around the grab point. Everything is critically damped — no
 * spring, no oscillation, nothing jelly. Near the scroller's edges the
 * sheet auto-scrolls; the scrolled distance counts toward the drag.
 *
 * While the dragged card covers another, the two trade places (a live swap
 * preview); otherwise the landing hint slides to the nearest spot the card
 * genuinely fits.
 */
const FOLLOW = 0.18;
const TILT_PER_VELOCITY = 0.75;
const TILT_MAX = 12;
const TILT_EASE = 0.15;

// Swap triggers once the dragged card covers this fraction of the smaller of
// the two cards. Low enough that a small card easing onto a big neighbour
// (a couple of rows deep) already proposes the trade — waiting for a third
// of the card made stacked pairs feel dead.
const SWAP_OVERLAP = 0.2;

// Extra cells of slack past the outermost card while dragging (both axes) —
// there's always room ahead, which is what makes the sheet effectively
// infinite right and down.
export const DRAG_SLACK = 8;

export type Drag = { id: string; dx: number; dy: number; tilt: number };

export type Swap = { id: string; col: number; row: number; theirCol: number; theirRow: number };

type UseCardDragArgs = {
    boardRef: RefObject<HTMLDivElement | null>;
    CELL: number;
    f: number;
    slots: Slots;
    setSlots: Dispatch<SetStateAction<Slots>>;
    // A grab lifts the card above everything (the sheet's z counter).
    raise: (id: string) => void;
    // The ids currently on the sheet: a card can't stay grabbed while it's
    // being replaced.
    widgetIds: Set<string>;
};

export const useCardDrag = ({
    boardRef,
    CELL,
    f,
    slots,
    setSlots,
    raise,
    widgetIds,
}: UseCardDragArgs) => {
    const [drag, setDrag] = useState<Drag | null>(null);
    // Where the card is held, relative to its slot — the rotation/scale pivot.
    // Persists after release so the settle animation keeps the same origin.
    const [grab, setGrab] = useState<{ id: string; x: number; y: number } | null>(null);
    const startRef = useRef<{
        id: string;
        x: number;
        y: number;
        scrollTop: number;
        scrollLeft: number;
    } | null>(null);
    // Live mirror of the drag state — pointerup handlers can lag a render
    // behind the frame loop, so the commit reads the ref, not the state.
    const dragRef = useRef<Drag | null>(null);
    const pointRef = useRef({ x: 0, y: 0 });
    // Heavy-body state: the card's smoothed position (it trails the raw
    // pointer delta), its previous x (for velocity) and the current lean.
    const posRef = useRef({ x: 0, y: 0 });
    const prevXRef = useRef(0);
    const tiltRef = useRef(0);
    const rafRef = useRef(0);
    const scrollSpeedRef = useRef({ x: 0, y: 0 });

    const cancel = useCallback(() => {
        startRef.current = null;
        dragRef.current = null;
        scrollSpeedRef.current = { x: 0, y: 0 };
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        tiltRef.current = 0;
        setDrag(null);
    }, []);

    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    // The grabbed card vanished (replaced by a newer turn) → let go.
    useEffect(() => {
        if (startRef.current && !widgetIds.has(startRef.current.id)) {
            cancel();
        }
    }, [widgetIds, cancel]);

    // One frame loop for the whole drag: applies edge auto-scroll, then the
    // heavy-body step. The raw target is the pointer delta plus however far
    // the sheet has scrolled since grab (auto-scroll and wheel both slide the
    // sheet under a stationary pointer); the card approaches it viscously and
    // leans against its own smoothed velocity.
    const frame = () => {
        const start = startRef.current;

        if (!start) {
            rafRef.current = 0;

            return;
        }

        const scroller = scrollerOf(boardRef);

        if (scroller && (scrollSpeedRef.current.x !== 0 || scrollSpeedRef.current.y !== 0)) {
            scroller.scrollBy(scrollSpeedRef.current.x, scrollSpeedRef.current.y);
        }

        const scrollDeltaX = (scroller?.scrollLeft ?? 0) - start.scrollLeft;
        const scrollDeltaY = (scroller?.scrollTop ?? 0) - start.scrollTop;
        const targetX = pointRef.current.x - start.x + scrollDeltaX;
        const targetY = pointRef.current.y - start.y + scrollDeltaY;

        posRef.current = {
            x: posRef.current.x + (targetX - posRef.current.x) * FOLLOW,
            y: posRef.current.y + (targetY - posRef.current.y) * FOLLOW,
        };

        const vx = posRef.current.x - prevXRef.current;

        prevXRef.current = posRef.current.x;
        const lean = clamp(-vx * TILT_PER_VELOCITY, -TILT_MAX, TILT_MAX);

        tiltRef.current += (lean - tiltRef.current) * TILT_EASE;

        // Fully at rest → snap flush so the numbers stop churning.
        if (
            Math.abs(targetX - posRef.current.x) < 0.5 &&
            Math.abs(targetY - posRef.current.y) < 0.5 &&
            Math.abs(vx) < 0.05 &&
            Math.abs(tiltRef.current) < 0.1
        ) {
            posRef.current = { x: targetX, y: targetY };
            tiltRef.current = 0;
        }

        const next = {
            id: start.id,
            dx: posRef.current.x,
            dy: posRef.current.y,
            tilt: tiltRef.current,
        };
        const prev = dragRef.current;

        if (
            !prev ||
            Math.abs(prev.dx - next.dx) > 0.05 ||
            Math.abs(prev.dy - next.dy) > 0.05 ||
            Math.abs(prev.tilt - next.tilt) > 0.02
        ) {
            dragRef.current = next;
            setDrag(next);
        }

        rafRef.current = requestAnimationFrame(frame);
    };

    const startDrag = (id: string) => (event: React.PointerEvent<HTMLElement>) => {
        event.preventDefault();
        // The grab bar moves the CARD — don't let the board see this and pan.
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);

        const scroller = scrollerOf(boardRef);
        // The pivot is the exact point being held (the handle floats above
        // the card, so y comes out slightly negative — hanging from a string).
        const slotRect = event.currentTarget.parentElement?.getBoundingClientRect();

        setGrab({
            id,
            x: slotRect ? event.clientX - slotRect.left : 0,
            y: slotRect ? event.clientY - slotRect.top : 0,
        });

        startRef.current = {
            id,
            x: event.clientX,
            y: event.clientY,
            scrollTop: scroller?.scrollTop ?? 0,
            scrollLeft: scroller?.scrollLeft ?? 0,
        };
        pointRef.current = { x: event.clientX, y: event.clientY };
        posRef.current = { x: 0, y: 0 };
        prevXRef.current = 0;
        tiltRef.current = 0;
        scrollSpeedRef.current = { x: 0, y: 0 };
        // The grabbed card rides above everything it crosses — and stays there.
        raise(id);
        dragRef.current = { id, dx: 0, dy: 0, tilt: 0 };
        setDrag(dragRef.current);
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(frame);
    };

    const moveDrag = (event: React.PointerEvent) => {
        if (!startRef.current) {
            return;
        }

        // The frame loop reads pointer positions per frame and derives the
        // acceleration itself — the handler only records where the pointer is.
        pointRef.current = { x: event.clientX, y: event.clientY };
        scrollSpeedRef.current = edgeScrollSpeed(
            scrollerOf(boardRef),
            event.clientX,
            event.clientY,
            f,
        );
    };

    // The cell the dragged card would snap to from its current offset.
    const snapTarget = (slot: Slot, current: Drag): Spot => ({
        col: clamp(Math.round(slot.col + current.dx / CELL), 0, Math.max(0, MAX_COLS - slot.w)),
        row: Math.max(0, Math.round(slot.row + current.dy / CELL)),
    });

    // While the dragged card's visual centre hovers over another card, the
    // two trade: the hovered card takes the vacated outline, and the dragged
    // card lands as close to where it's held as the layout allows (not
    // force-anchored to the other card's corner). Pinning doesn't block this
    // — pinned only means "incoming widgets can't move or replace me".
    const resolveSwap = (current: Drag): Swap | null => {
        const slot = slots[current.id];

        if (!slot) {
            return null;
        }

        // The card the drag covers most, by overlap area relative to the
        // smaller of the pair.
        const x0 = slot.col * CELL + current.dx;
        const y0 = slot.row * CELL + current.dy;
        let hit: [string, Slot] | null = null;
        let hitRatio = 0;

        for (const [otherId, other] of Object.entries(slots)) {
            if (otherId === current.id || other.leaving) {
                continue;
            }

            const overlapX = Math.max(
                0,
                Math.min(x0 + slot.w * CELL, (other.col + other.w) * CELL) -
                    Math.max(x0, other.col * CELL),
            );
            const overlapY = Math.max(
                0,
                Math.min(y0 + slot.h * CELL, (other.row + other.h) * CELL) -
                    Math.max(y0, other.row * CELL),
            );
            const ratio =
                (overlapX * overlapY) /
                (CELL * CELL * Math.min(slot.w * slot.h, other.w * other.h));

            if (ratio > hitRatio) {
                hitRatio = ratio;
                hit = [otherId, other];
            }
        }

        if (!hit || hitRatio < SWAP_OVERLAP) {
            return null;
        }

        const [otherId, other] = hit;
        const rest = liveRects(slots, [current.id, otherId]);
        // The dragged card lands where it's held (falling back to the
        // partner's vacated corner) — it only needs to clear THIRD cards;
        // the partner is moving out anyway.
        const aim = snapTarget(slot, current);
        const candidates = [
            { col: aim.col, row: aim.row },
            { col: other.col, row: other.row },
        ];
        let myNew: Rect | null = null;

        for (const spot of candidates) {
            const rect: Rect = { col: spot.col, row: spot.row, w: slot.w, h: slot.h };

            if (
                rect.col + rect.w <= MAX_COLS &&
                !rest.some((blocker) => tooCloseRects(rect, blocker))
            ) {
                myNew = rect;
                break;
            }
        }

        if (!myNew) {
            return null;
        }

        // The partner heads for the dragged card's origin — landing exactly
        // there when it fits, otherwise minimally adjusted (a taller card
        // swapped upward needs a nudge down)…
        const theirSpot = nearestSpot(
            { col: slot.col, row: slot.row },
            other.w,
            other.h,
            [myNew, ...rest],
            MAX_COLS,
        );

        if (!theirSpot) {
            return null;
        }

        let theirNew: Rect = { col: theirSpot.col, row: theirSpot.row, w: other.w, h: other.h };

        // …then compacts LEFT — but only TOWARD the dragged card's column,
        // never past it. That closes the hole in a same-row trade without
        // yanking a vertical partner across the board to the left wall.
        const settledForThem: Rect[] = [myNew, ...rest];

        while (theirNew.col > 0 && theirNew.col > myNew.col) {
            const shifted: Rect = { ...theirNew, col: theirNew.col - 1 };

            if (settledForThem.some((rect) => tooCloseRects(shifted, rect))) {
                break;
            }

            theirNew = shifted;
        }

        return {
            id: otherId,
            col: myNew.col,
            row: myNew.row,
            theirCol: theirNew.col,
            theirRow: theirNew.row,
        };
    };

    const endDrag = (commit: boolean) => () => {
        const current = dragRef.current;

        cancel();

        if (commit && current) {
            const slot = slots[current.id];
            const swap = slot ? resolveSwap(current) : null;

            if (slot && swap) {
                // Trade: the hovered card takes the vacated outline, the
                // dragged one settles on its proposed landing spot.
                setSlots((prev) => {
                    const a = prev[current.id];
                    const b = prev[swap.id];

                    if (!a || !b) {
                        return prev;
                    }

                    return {
                        ...prev,
                        [current.id]: { ...a, col: swap.col, row: swap.row },
                        [swap.id]: { ...b, col: swap.theirCol, row: swap.theirRow },
                    };
                });
            } else if (slot) {
                // Same spot the hint showed: nearest place the card fits —
                // nobody else moves on a plain drop.
                const spot = nearestSpot(
                    snapTarget(slot, current),
                    slot.w,
                    slot.h,
                    liveRects(slots, [current.id]),
                    MAX_COLS,
                );

                if (spot) {
                    setSlots((prev) => ({
                        ...prev,
                        [current.id]: { ...prev[current.id]!, col: spot.col, row: spot.row },
                    }));
                }
            }
        }
    };

    // The dragged slot, the live swap proposal and the landing hint —
    // computed per render for the sheet's ghosts and extent.
    const dragged = drag ? slots[drag.id] : undefined;
    // A live swap proposal takes precedence over plain snapping; otherwise
    // the landing hint always points at the nearest spot the card can take.
    const swap = drag && dragged ? resolveSwap(drag) : null;
    // Outside a swap the landing hint slides to the nearest genuinely free
    // spot — it never overlaps anyone; overlapping aims are the swap's job.
    const landing: Spot | null = swap
        ? { col: swap.col, row: swap.row }
        : drag && dragged
          ? nearestSpot(
                snapTarget(dragged, drag),
                dragged.w,
                dragged.h,
                liveRects(slots, [drag.id]),
                MAX_COLS,
            )
          : null;

    return {
        drag,
        grab,
        dragged,
        swap,
        landing,
        // Read by frame-lag-safe checks (the arrival scroll skips a busy user).
        isDragging: () => startRef.current !== null,
        startDrag,
        moveDrag,
        endDrag,
    };
};
