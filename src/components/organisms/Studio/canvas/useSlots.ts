'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
    clamp,
    findSpot,
    LEAVE_MS,
    MAX_COLS,
    nearestSpot,
    type Rect,
    settleAround,
    type Slots,
    SPAN_DEFAULT,
    SPAN_MAX,
    SPAN_MIN,
    tooCloseRects,
} from './layout';

import type { CardLayout } from '@/lib/chat/history';
import type { Widget } from '@/lib/chat/widgets';

type UseSlotsArgs = {
    widgets: Widget[];
    pinnedIds: string[];
    // A restored conversation's saved card rects — newcomers found here mount
    // straight into their old spot and size instead of auto-placing.
    initialLayout?: CardLayout;
    // View width in cells: auto-placed newcomers stay inside the window.
    viewCols: number;
    // Reports the live layout after every settle, for persistence.
    onLayoutChange?: (layout: CardLayout) => void;
};

/**
 * Where every card sits. Places widgets as they stream in; widgets that
 * vanished (replaced by a newer turn, or a reset) fade out in place before
 * their slot is pruned. Newcomers get PRIORITY: they take the highest spot
 * honouring only pinned cards, and any unpinned veteran they crowd slides to
 * the nearest place that still fits. Also owns the text card's content-fit
 * (rows follow the text) and the z-order counter.
 */
export const useSlots = ({
    widgets,
    pinnedIds,
    initialLayout,
    viewCols,
    onLayoutChange,
}: UseSlotsArgs) => {
    const [slots, setSlots] = useState<Slots>({});
    const zRef = useRef(1);
    const leaveTimersRef = useRef<number[]>([]);

    useEffect(
        () => () => leaveTimersRef.current.forEach((timer) => window.clearTimeout(timer)),
        [],
    );

    // (rAF-wrapped by the house convention.)
    useEffect(() => {
        if (!viewCols) {
            return undefined;
        }

        const frame = requestAnimationFrame(() => {
            const ids = new Set(widgets.map((widget) => widget.id));
            const byId = new Map(widgets.map((widget) => [widget.id, widget]));

            setSlots((prev) => {
                const next: Slots = {};
                let changed = false;

                for (const [id, slot] of Object.entries(prev)) {
                    if (ids.has(id)) {
                        // Same card, possibly new content (an edited text
                        // card): the slot re-points at the fresh widget.
                        const fresh = byId.get(id)!;

                        if (fresh !== slot.widget) {
                            next[id] = { ...slot, widget: fresh };
                            changed = true;
                        } else {
                            next[id] = slot;
                        }
                    } else if (slot.leaving) {
                        next[id] = slot;
                    } else {
                        next[id] = { ...slot, leaving: true };
                        changed = true;
                    }
                }

                const newcomers = widgets.filter((widget) => !next[widget.id]);

                if (newcomers.length === 0) {
                    return changed ? next : prev;
                }

                // Newcomers stack from the top, dodging the pinned cards…
                const settled: Rect[] = Object.entries(next)
                    .filter(([id, slot]) => pinnedIds.includes(id) && !slot.leaving)
                    .map(([, slot]) => slot);
                // …and, for the newcomers only, every other live card too.
                const occupied: Rect[] = Object.entries(next)
                    .filter(([, slot]) => !slot.leaving)
                    .map(([, slot]) => slot);

                for (const widget of newcomers) {
                    // A restored card keeps its saved rect (size clamped to
                    // the current per-kind range); fresh ones auto-place.
                    const saved = initialLayout?.[widget.id];
                    const min = SPAN_MIN[widget.kind];
                    const max = SPAN_MAX[widget.kind];
                    const w = saved ? clamp(saved.w, min.w, max.w) : SPAN_DEFAULT[widget.kind].w;
                    const h = saved ? clamp(saved.h, min.h, max.h) : SPAN_DEFAULT[widget.kind].h;
                    // A saved spot is honoured only while it's free — a card
                    // put back later (chat chip → Add) whose old place is now
                    // taken lands at the nearest free spot instead of on top.
                    const savedSpot = saved ? { col: saved.col, row: saved.row } : null;
                    const spot = savedSpot
                        ? occupied.some((rect) => tooCloseRects({ ...savedSpot, w, h }, rect))
                            ? (nearestSpot(savedSpot, w, h, occupied, MAX_COLS) ??
                              findSpot(w, h, occupied, viewCols))
                            : savedSpot
                        : findSpot(w, h, occupied, viewCols);

                    next[widget.id] = { ...spot, w, h, z: zRef.current++, widget };
                    settled.push(next[widget.id]);
                    occupied.push(next[widget.id]);
                }

                // Unpinned veterans make room: top-left order, keep the spot
                // if it's still clear, otherwise slide to the nearest fit.
                // (Newcomers already dodged them, so on a re-add nobody moves;
                // this only bites when a saved rect had to be honoured.)
                const veterans = Object.entries(next)
                    .filter(
                        ([id, slot]) =>
                            !slot.leaving &&
                            !pinnedIds.includes(id) &&
                            !newcomers.some((widget) => widget.id === id),
                    )
                    .sort(([, a], [, b]) => a.row - b.row || a.col - b.col);

                for (const [id, slot] of veterans) {
                    if (settled.some((rect) => tooCloseRects(slot, rect))) {
                        const spot = nearestSpot(
                            { col: slot.col, row: slot.row },
                            slot.w,
                            slot.h,
                            settled,
                            MAX_COLS,
                        ) ?? { col: slot.col, row: slot.row };

                        next[id] = { ...slot, col: spot.col, row: spot.row };
                    }

                    settled.push(next[id]!);
                }

                return next;
            });

            // Prune whatever finished fading — a no-op when nothing left.
            const timer = window.setTimeout(() => {
                setSlots((prev) => {
                    const entries = Object.entries(prev);
                    const kept = entries.filter(([, slot]) => !slot.leaving);

                    return kept.length === entries.length ? prev : Object.fromEntries(kept);
                });
            }, LEAVE_MS);

            leaveTimersRef.current.push(timer);
        });

        return () => cancelAnimationFrame(frame);
    }, [widgets, pinnedIds, viewCols, initialLayout]);

    // Every settle (placement, drop, swap, resize) reports the live layout —
    // the parent persists it with the conversation.
    useEffect(() => {
        if (!onLayoutChange) {
            return;
        }

        const layout: CardLayout = {};

        for (const [id, slot] of Object.entries(slots)) {
            if (!slot.leaving) {
                layout[id] = { col: slot.col, row: slot.row, w: slot.w, h: slot.h };
            }
        }

        onLayoutChange(layout);
    }, [slots, onLayoutChange]);

    // A text card's content-driven height: set the slot's rows and let the
    // unpinned neighbours make room — pinned ones too, since this is the
    // user's own edit (pin protects against incoming widgets).
    const fitRows = useCallback(
        (id: string, rows: number) => {
            setSlots((prev) => {
                const slot = prev[id];

                if (!slot) {
                    return prev;
                }

                const h = clamp(rows, SPAN_MIN[slot.widget.kind].h, SPAN_MAX[slot.widget.kind].h);

                if (h === slot.h) {
                    return prev;
                }

                return settleAround({ ...prev, [id]: { ...slot, h } }, [id], pinnedIds, true);
            });
        },
        [pinnedIds],
    );

    // Lift a card above everything else (a grab): it stays there.
    const raise = useCallback((id: string) => {
        setSlots((prev) =>
            prev[id] ? { ...prev, [id]: { ...prev[id], z: zRef.current++ } } : prev,
        );
    }, []);

    return { slots, setSlots, fitRows, raise };
};
