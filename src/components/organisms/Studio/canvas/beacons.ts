import type { BoardView } from './board';
import { type CardView, clamp, effectiveKind, type Slots } from './layout';

import type { Widget } from '@/lib/chat/widgets';

/**
 * Off-screen beacons: for every card outside the current view, a little
 * arrow pinned to the view's edge points at it (title + distance in cells),
 * so nothing parked far away ever gets lost. Each beacon belongs to ONE edge
 * (largest overshoot); per-edge neighbours within a pill's footprint merge
 * into a stacked cluster, then a corner pass merges clusters from DIFFERENT
 * edges whose pins land next to each other. All coordinates are VIEW-space —
 * the pills live in a sticky layer, so panning never moves them.
 */

// Beacons hug the VISIBLE canvas edge at this constant distance — identical
// on all four sides. (The canvas bottom runs past the viewport; the measured
// overhang is subtracted so "visible edge" really means visible.)
const BEACON_PAD = 4;
// Pins closer than this to a corner bloom their hover panel inward from the
// corner instead of centred (so it never clips outside the canvas).
const BEACON_CORNER = 140;
// Per-edge clustering span (collapsed beacons are small circles, so tight).
const EDGE_SPAN = 40;

export type BeaconEdge = 'left' | 'right' | 'top' | 'bottom';

type RawBeacon = {
    id: string;
    title: string;
    // Card centre in view space (drives arrows) and board space (drives the
    // click-to-fly scroll).
    cxV: number;
    cyV: number;
    cx: number;
    cy: number;
    edge: BeaconEdge;
    pos: number;
};

type EdgeCluster = {
    edge: BeaconEdge;
    pinX: number;
    pinY: number;
    translate: string;
    group: RawBeacon[];
};

export type BeaconItem = {
    id: string;
    title: string;
    cx: number;
    cy: number;
    cells: number;
    deg: number;
};

export type Beacon = {
    key: string;
    edge: BeaconEdge;
    align: 'start' | 'center' | 'end';
    items: BeaconItem[];
    x: number;
    y: number;
    translate: string;
    // Group centroid in board coords — the whole-beacon click target.
    cx: number;
    cy: number;
    // The collapsed circle's single arrow points at the group.
    deg: number;
};

type ComputeArgs = {
    slots: Slots;
    view: BoardView;
    origin: { x: number; y: number };
    CELL: number;
    f: number;
    // An active card-type filter narrows the beacons too — they only point
    // at what's currently in focus.
    dimKind?: Widget['kind'];
    views: Record<string, CardView>;
    titleOf: (widget: Widget) => string;
};

export const computeBeacons = ({
    slots,
    view,
    origin,
    CELL,
    f,
    dimKind,
    views,
    titleOf,
}: ComputeArgs): Beacon[] => {
    const viewW = view.width;
    const viewH = view.height;

    if (!viewW) {
        return [];
    }

    const raw: RawBeacon[] = Object.entries(slots)
        .filter(
            ([, slot]) =>
                !slot.leaving &&
                (!dimKind || effectiveKind(slot.widget, views[slot.widget.id]) === dimKind),
        )
        .flatMap(([id, slot]) => {
            const cardLeft = origin.x + slot.col * CELL - view.left;
            const cardTop = origin.y + slot.row * CELL - view.top;
            const cardRight = cardLeft + slot.w * CELL;
            const cardBottom = cardTop + slot.h * CELL;
            const onScreen = cardLeft < viewW && cardRight > 0 && cardTop < viewH && cardBottom > 0;

            if (onScreen) {
                return [];
            }

            const cxV = (cardLeft + cardRight) / 2;
            const cyV = (cardTop + cardBottom) / 2;
            // Dominant edge = the axis the card is furthest beyond.
            const outX = cardRight < 0 ? cardRight : cardLeft > viewW ? cardLeft - viewW : 0;
            const outY = cardBottom < 0 ? cardBottom : cardTop > viewH ? cardTop - viewH : 0;
            const horizontal = Math.abs(outX) >= Math.abs(outY);
            const edge: BeaconEdge = horizontal
                ? outX < 0
                    ? 'left'
                    : 'right'
                : outY < 0
                  ? 'top'
                  : 'bottom';
            // Position along that edge (the pill's free coordinate), kept
            // clear of the corners.
            const pos = horizontal
                ? clamp(cyV, 20, viewH - view.overhang - 20)
                : clamp(cxV, 20, viewW - 20);

            return [
                {
                    id,
                    title: titleOf(slot.widget),
                    cxV,
                    cyV,
                    cx: cxV + view.left,
                    cy: cyV + view.top,
                    edge,
                    pos,
                },
            ];
        });

    const span = EDGE_SPAN * f;
    const pad = BEACON_PAD * f;
    const corner = BEACON_CORNER * f;

    const edgeClusters: EdgeCluster[] = (['left', 'right', 'top', 'bottom'] as const).flatMap(
        (edge) => {
            const along = raw.filter((item) => item.edge === edge).sort((a, b) => a.pos - b.pos);
            const groups: RawBeacon[][] = [];

            for (const item of along) {
                const last = groups[groups.length - 1];

                if (last && item.pos - last[last.length - 1]!.pos < span) {
                    last.push(item);
                } else {
                    groups.push([item]);
                }
            }

            return groups.map((group) => {
                const pos = group.reduce((sum, item) => sum + item.pos, 0) / group.length;

                return {
                    edge,
                    pinX: edge === 'left' ? pad : edge === 'right' ? viewW - pad : pos,
                    pinY:
                        edge === 'top'
                            ? pad
                            : edge === 'bottom'
                              ? viewH - pad - view.overhang
                              : pos,
                    translate:
                        edge === 'left'
                            ? '0% -50%'
                            : edge === 'right'
                              ? '-100% -50%'
                              : edge === 'top'
                                ? '-50% 0%'
                                : '-50% -100%',
                    group,
                };
            });
        },
    );

    const merged: EdgeCluster[] = [];

    for (const cluster of edgeClusters) {
        const near = merged.find(
            (other) =>
                Math.abs(other.pinX - cluster.pinX) < span &&
                Math.abs(other.pinY - cluster.pinY) < span,
        );

        if (near) {
            near.group.push(...cluster.group);
        } else {
            merged.push({ ...cluster, group: [...cluster.group] });
        }
    }

    return merged.map(({ edge, pinX, pinY, translate, group }) => {
        const items: BeaconItem[] = group
            .map((item) => ({
                id: item.id,
                title: item.title,
                cx: item.cx,
                cy: item.cy,
                cells: Math.max(1, Math.round(Math.hypot(item.cxV - pinX, item.cyV - pinY) / CELL)),
                deg: (Math.atan2(item.cyV - pinY, item.cxV - pinX) * 180) / Math.PI,
            }))
            .sort((a, b) => a.cells - b.cells);
        const avgCxV = group.reduce((sum, item) => sum + item.cxV, 0) / group.length;
        const avgCyV = group.reduce((sum, item) => sum + item.cyV, 0) / group.length;
        // Pins near a corner bloom their panel inward from that corner so it
        // never pokes outside the canvas.
        const align =
            edge === 'top' || edge === 'bottom'
                ? pinX < corner
                    ? 'start'
                    : pinX > viewW - corner
                      ? 'end'
                      : 'center'
                : pinY < corner
                  ? 'start'
                  : pinY > viewH - view.overhang - corner
                    ? 'end'
                    : 'center';

        return {
            key: items[0]!.id,
            edge,
            align,
            items,
            x: pinX,
            y: pinY,
            translate,
            cx: group.reduce((sum, item) => sum + item.cx, 0) / group.length,
            cy: group.reduce((sum, item) => sum + item.cy, 0) / group.length,
            deg: (Math.atan2(avgCyV - pinY, avgCxV - pinX) * 180) / Math.PI,
        };
    });
};
