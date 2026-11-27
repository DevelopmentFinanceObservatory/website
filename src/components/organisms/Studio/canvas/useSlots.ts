'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Placement } from './blocks';
import {
    type CardView,
    clamp,
    heightRange,
    LEAVE_MS,
    resolveCardView,
    settleAround,
    type Slots,
} from './layout';
import { type Coming, type Ghosts, placeGhosts, placeholderOf } from './comingGhosts';
import { placeSlots } from './placeSlots';

import type { CardLayout } from '@/lib/chat/history';
import type { Widget } from '@/lib/chat/widgets';

const NONE: readonly Coming[] = [];

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
    // Where a fresh card lands: the first free spot from the corner
    // (`pack`), or its question's block (`blocks`, blocks.ts).
    placement?: Placement;
    // Reports the live layout after every settle, for persistence.
    onLayoutChange?: (layout: CardLayout) => void;
    // Cards that replaced another in its slot, new id → old id: the new
    // card takes the old one's slot, place and size.
    replacedIds?: Record<string, string>;
    // The cards a running turn has announced, which stand as placeholders
    // until their cards land (comingGhosts.ts).
    coming?: readonly Coming[];
};

/**
 * Where every card sits. Places widgets as they stream in; widgets that
 * vanished (taken off the canvas, or a reset) fade out in place before
 * their slot is pruned. A fresh newcomer takes the first spot clear of every
 * live card (blocks.ts `newcomerSpot`); a restored one takes its saved rect,
 * and any unpinned veteran that rect crowds slides to the nearest place that
 * still fits. Also owns the content-fit of every card
 * but a stat card (rows follow the content) and the z-order counter.
 */
export const useSlots = ({
    widgets,
    pinnedIds,
    views,
    initialLayout,
    viewCols,
    placement = 'pack',
    onLayoutChange,
    replacedIds,
    coming = NONE,
}: UseSlotsArgs) => {
    const [slots, setSlots] = useState<Slots>({});
    const [ghosts, setGhosts] = useState<Ghosts>({});
    // The placeholders as of the last placement, which the next one reads.
    const ghostsRef = useRef<Ghosts>({});
    // The slots as of the last render, which a placement starts from.
    const slotsRef = useRef<Slots>(slots);

    useEffect(() => {
        slotsRef.current = slots;
    });
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
            // The cards and the placeholders are placed in one update, so a
            // card that lands takes its placeholder's place in the frame the
            // placeholder goes.
            const placed = placeSlots(slotsRef.current, {
                widgets,
                pinnedIds,
                views,
                initialLayout,
                cols: viewCols,
                placement,
                replacedIds,
                nextZ: () => zRef.current++,
                ghosts: ghostsRef.current,
            });
            const claimed = new Set(widgets.flatMap((widget) => placeholderOf(widget) ?? []));
            const standing = placeGhosts({
                current: ghostsRef.current,
                coming,
                claimed,
                slots: placed,
                cols: viewCols,
                placement,
                now: Date.now(),
            });

            slotsRef.current = placed;
            ghostsRef.current = standing;
            setSlots(placed);
            setGhosts(standing);

            // Prune whatever finished fading — a no-op when nothing left.
            const timer = window.setTimeout(() => {
                setSlots((prev) => {
                    const entries = Object.entries(prev);
                    const kept = entries.filter(([, slot]) => !slot.leaving);

                    return kept.length === entries.length ? prev : Object.fromEntries(kept);
                });
                setGhosts((prev) => {
                    const entries = Object.entries(prev);
                    const kept = entries.filter(([, ghost]) => !ghost.leaving);

                    ghostsRef.current =
                        kept.length === entries.length ? prev : Object.fromEntries(kept);

                    return ghostsRef.current;
                });
            }, LEAVE_MS);

            leaveTimersRef.current.push(timer);
        });

        return () => cancelAnimationFrame(frame);
    }, [widgets, pinnedIds, views, viewCols, placement, initialLayout, replacedIds, coming]);

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

    // Sets the slot's rows for a derived height (every card but a stat card),
    // within the range of its current view, and lets the neighbours make
    // room. Pinned ones move too, since the card cannot take less.
    const fitRows = useCallback(
        (id: string, rows: number) => {
            setSlots((prev) => {
                const slot = prev[id];

                if (!slot) {
                    return prev;
                }

                const { min, max } = heightRange(
                    slot.widget,
                    resolveCardView(slot.widget, views[id]).view,
                );
                const h = clamp(rows, min, max);

                if (h === slot.h) {
                    return prev;
                }

                return settleAround({ ...prev, [id]: { ...slot, h } }, [id], pinnedIds, true);
            });
        },
        [pinnedIds, views],
    );

    // Lift a card above everything else (a grab): it stays there.
    const raise = useCallback((id: string) => {
        setSlots((prev) =>
            prev[id] ? { ...prev, [id]: { ...prev[id], z: zRef.current++ } } : prev,
        );
    }, []);

    return { slots, setSlots, ghosts, fitRows, raise };
};
