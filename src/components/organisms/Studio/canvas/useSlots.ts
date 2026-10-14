'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
    type CardView,
    clamp,
    findSpot,
    heightRange,
    LEAVE_MS,
    MAX_COLS,
    nearestSpot,
    type Rect,
    resolveCardView,
    settleAround,
    settleSpot,
    type Slots,
    SPAN_MAX,
    SPAN_MIN,
    spawnSpan,
    tooCloseRects,
} from './layout';

import type { CardLayout } from '@/lib/chat/history';
import type { Widget } from '@/lib/chat/widgets';
import { FITTED_ROWS_MAX } from '@/lib/studio/chartFit';

type UseSlotsArgs = {
    widgets: Widget[];
    pinnedIds: string[];
    // Per-card view picks. A card's view decides whether its height is
    // derived, and so the heights its slot may hold.
    views: Record<string, CardView>;
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
 * the nearest place that still fits. Also owns the content-fit of text cards
 * and chart views (rows follow the content) and the z-order counter.
 */
export const useSlots = ({
    widgets,
    pinnedIds,
    views,
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
                        // card): the slot re-points at the fresh widget. Its
                        // height stays inside what its view allows, so a chart
                        // switched to the table view comes back into the
                        // grip's range.
                        const fresh = byId.get(id)!;
                        const { min, max } = heightRange(
                            fresh,
                            resolveCardView(fresh, views[id]).view,
                        );
                        const h = clamp(slot.h, min, max);

                        if (fresh !== slot.widget || h !== slot.h) {
                            next[id] = { ...slot, widget: fresh, h };
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
                    // A restored card keeps its saved rect, its width clamped
                    // to the kind's range and its height to what its view
                    // allows; fresh ones auto-place at their spawn footprint.
                    // A derived height refits once the card mounts.
                    const saved = initialLayout?.[widget.id];
                    const resolved = resolveCardView(widget, views[widget.id]);
                    const rows = heightRange(widget, resolved.view);
                    const { w, h } = saved
                        ? {
                              w: clamp(saved.w, SPAN_MIN[widget.kind].w, SPAN_MAX[widget.kind].w),
                              h: clamp(saved.h, rows.min, rows.max),
                          }
                        : spawnSpan(widget, resolved);
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
                        next[id] = { ...slot, ...settleSpot(slot, settled) };
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
    }, [widgets, pinnedIds, views, viewCols, initialLayout]);

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

    // Sets the slot's rows for a derived height (a text card, a chart view),
    // between the kind's minimum and the cap, and lets the neighbours make
    // room. Pinned ones move too, since the card cannot take less.
    const fitRows = useCallback(
        (id: string, rows: number) => {
            setSlots((prev) => {
                const slot = prev[id];

                if (!slot) {
                    return prev;
                }

                const h = clamp(rows, SPAN_MIN[slot.widget.kind].h, FITTED_ROWS_MAX);

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
