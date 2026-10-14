'use client';

import {
    type Dispatch,
    type RefObject,
    type SetStateAction,
    useEffect,
    useRef,
    useState,
} from 'react';

import { edgeScrollSpeed, scrollerOf } from './board';
import { clamp, GAP, settleAround, type Slots, SPAN_MAX, SPAN_MIN, tooCloseRects } from './layout';
import { DRAG_SLACK } from './useCardDrag';

/**
 * Literal corner-grip resizing: snapped to cells, clamped to the per-kind
 * range. A card whose height is derived (layout's heightIsDerived) resizes in
 * width only, and its height follows through the card's own fit. Pinned
 * neighbours are hard walls (a step into them is refused);
 * unpinned ones scoot to the nearest fit live, step by step. Like a drag,
 * holding the grip near an edge auto-scrolls the sheet, and the scrolled
 * distance counts toward the resize (its own rAF loop).
 */
type UseCardResizeArgs = {
    boardRef: RefObject<HTMLDivElement | null>;
    CELL: number;
    f: number;
    slots: Slots;
    setSlots: Dispatch<SetStateAction<Slots>>;
    pinnedIds: string[];
    // The sheet's current extent in cells (outermost card edges) — frozen as
    // the floor for the duration of a grip.
    extent: { rightCol: number; bottomRow: number };
};

export const useCardResize = ({
    boardRef,
    CELL,
    f,
    slots,
    setSlots,
    pinnedIds,
    extent,
}: UseCardResizeArgs) => {
    const startRef = useRef<{
        id: string;
        widthOnly: boolean;
        w: number;
        h: number;
        x: number;
        y: number;
        scrollLeft: number;
        scrollTop: number;
    } | null>(null);
    const rafRef = useRef(0);
    const pointRef = useRef({ x: 0, y: 0 });
    const speedRef = useRef({ x: 0, y: 0 });
    // While a grip is held the sheet must not shrink under it: the extent it
    // had at grab time (plus slack) is the floor until release — otherwise
    // shrinking a card at the edge yanks the scroll and the grip escapes.
    const [floor, setFloor] = useState<{ cols: number; rows: number } | null>(null);

    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    const apply = (clientX: number, clientY: number) => {
        const start = startRef.current;

        if (!start) {
            return;
        }

        const scroller = scrollerOf(boardRef);
        const scrollDeltaX = (scroller?.scrollLeft ?? 0) - start.scrollLeft;
        const scrollDeltaY = (scroller?.scrollTop ?? 0) - start.scrollTop;
        const dx = clientX - start.x + scrollDeltaX;
        const dy = clientY - start.y + scrollDeltaY;

        setSlots((prev) => {
            const slot = prev[start.id];

            if (!slot) {
                return prev;
            }

            const min = SPAN_MIN[slot.widget.kind];
            const max = SPAN_MAX[slot.widget.kind];
            // Width and height resize independently; the card's innards
            // scale, with the Source/Built-with bar always pinned visible.
            // A derived height is the slot's live one. The fit changes it
            // mid-drag, and the height at grab time would undo that on
            // every move.
            const w = clamp(start.w + Math.round(dx / CELL), min.w, max.w);
            const h = start.widthOnly
                ? slot.h
                : clamp(start.h + Math.round(dy / CELL), min.h, max.h);

            if (w === slot.w && h === slot.h) {
                return prev;
            }

            const grown = { ...slot, w, h };
            // Pinned cards are walls — a step that would crowd one is refused.
            const blockedByPin = Object.entries(prev).some(
                ([otherId, other]) =>
                    otherId !== start.id &&
                    !other.leaving &&
                    pinnedIds.includes(otherId) &&
                    tooCloseRects(grown, other),
            );

            if (blockedByPin) {
                return prev;
            }

            return settleAround({ ...prev, [start.id]: grown }, [start.id], pinnedIds);
        });
    };

    // The resize frame loop: scroll by the edge speed and re-apply the size
    // from the last pointer position (the sheet moved under it).
    const frame = () => {
        if (!startRef.current) {
            rafRef.current = 0;

            return;
        }

        const speed = speedRef.current;

        if (speed.x !== 0 || speed.y !== 0) {
            scrollerOf(boardRef)?.scrollBy(speed.x, speed.y);
            apply(pointRef.current.x, pointRef.current.y);
        }

        rafRef.current = requestAnimationFrame(frame);
    };

    const startResize =
        (id: string, widthOnly: boolean) => (event: React.PointerEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);

            const slot = slots[id];
            const scroller = scrollerOf(boardRef);

            if (!slot) {
                return;
            }

            startRef.current = {
                id,
                widthOnly,
                w: slot.w,
                h: slot.h,
                x: event.clientX,
                y: event.clientY,
                scrollLeft: scroller?.scrollLeft ?? 0,
                scrollTop: scroller?.scrollTop ?? 0,
            };
            pointRef.current = { x: event.clientX, y: event.clientY };
            speedRef.current = { x: 0, y: 0 };
            setFloor({
                cols: extent.rightCol + GAP + DRAG_SLACK,
                rows: extent.bottomRow + GAP + DRAG_SLACK,
            });

            if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(frame);
            }
        };

    const moveResize = (event: React.PointerEvent) => {
        if (!startRef.current) {
            return;
        }

        pointRef.current = { x: event.clientX, y: event.clientY };
        speedRef.current = edgeScrollSpeed(scrollerOf(boardRef), event.clientX, event.clientY, f);
        apply(event.clientX, event.clientY);
    };

    const endResize = () => {
        startRef.current = null;
        speedRef.current = { x: 0, y: 0 };
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        // The sheet may shrink to fit now — after the release, not mid-drag.
        setFloor(null);
    };

    return { floor, startResize, moveResize, endResize };
};
