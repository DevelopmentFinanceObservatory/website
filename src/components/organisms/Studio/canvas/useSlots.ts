'use client';

import { type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

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
import type { Coming } from './comingGhosts';
import { type Board, EMPTY_BOARD, placeBoard, pruneBoard, updateSlots } from './slotsBoard';

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
 * still fits. Also owns the content-fit of every card (rows follow the
 * content; a stat card's only grow to hold it) and the z-order counter.
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
    // One state for the cards and the placeholders (slotsBoard.ts). Every
    // change is a functional update of it, so a fit that commits between two
    // placements survives.
    const [board, setBoard] = useState<Board>(EMPTY_BOARD);
    const { slots, ghosts, claimed } = board;
    const setSlots = useCallback(
        (update: SetStateAction<Slots>) => setBoard((prev) => updateSlots(prev, update)),
        [],
    );
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
            const now = Date.now();

            setBoard((prev) =>
                placeBoard(prev, {
                    widgets,
                    pinnedIds,
                    views,
                    initialLayout,
                    cols: viewCols,
                    placement,
                    replacedIds,
                    nextZ: () => zRef.current++,
                    coming,
                    now,
                }),
            );

            // Prune whatever finished fading — a no-op when nothing left.
            leaveTimersRef.current.push(window.setTimeout(() => setBoard(pruneBoard), LEAVE_MS));
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

    // Sets the slot's rows a card's content needs, within the range of its
    // current view, and lets the neighbours make room. Pinned ones move too,
    // since the card cannot take less. A stat card's slot only grows, so a
    // height the user dragged larger holds, and it keeps the rows as its
    // `need`, the floor of its grip (layout's floorRange).
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

                if (slot.widget.kind !== 'key_number') {
                    const h = clamp(rows, min, max);

                    return h === slot.h && slot.need === undefined
                        ? prev
                        : settleAround(
                              { ...prev, [id]: { ...slot, h, need: undefined } },
                              [id],
                              pinnedIds,
                              true,
                          );
                }

                const need = clamp(rows, min, max);
                const h = Math.max(slot.h, need);

                if (h === slot.h && need === slot.need) {
                    return prev;
                }

                const next = { ...prev, [id]: { ...slot, h, need } };

                return h === slot.h ? next : settleAround(next, [id], pinnedIds, true);
            });
        },
        [pinnedIds, views, setSlots],
    );

    // Lift a card above everything else (a grab): it stays there.
    const raise = useCallback(
        (id: string) => {
            setSlots((prev) =>
                prev[id] ? { ...prev, [id]: { ...prev[id], z: zRef.current++ } } : prev,
            );
        },
        [setSlots],
    );

    return { slots, setSlots, ghosts, claimed, fitRows, raise };
};
