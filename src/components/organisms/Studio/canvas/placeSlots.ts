// Relative .ts imports, so the node test runner loads this module as it is.
import type { CardLayout } from '../../../../lib/chat/history.ts';
import type { Widget } from '../../../../lib/chat/widgets.ts';
import { renameKey } from '../../../../lib/studio/cardReplace.ts';
import { floorItems, newcomerSpot, type Placement, questionTurn } from './blocks.ts';
import { type Ghosts, kindOf, placeholderOf } from './comingGhosts.ts';
import {
    type CardView,
    clamp,
    heightRange,
    MAX_COLS,
    nearestSpot,
    type Rect,
    resolveCardView,
    settleSpot,
    type Slots,
    SPAN_MAX,
    SPAN_MIN,
    spawnSpan,
    tooCloseRects,
} from './layout.ts';

export type PlaceSlotsArgs = {
    widgets: Widget[];
    pinnedIds: string[];
    views: Record<string, CardView>;
    initialLayout?: CardLayout;
    // Columns a fresh card may reach.
    cols: number;
    placement: Placement;
    replacedIds?: Record<string, string>;
    // The next stacking order, one per newcomer.
    nextZ: () => number;
    // The placeholders standing: a newcomer that names one takes its place,
    // and the rest keep clear of them.
    ghosts?: Ghosts;
};

/**
 * The slots after the widgets change: a replacement takes over its old
 * card's slot, a card that left starts fading, a card still here re-points
 * at its fresh widget, and newcomers are placed (newcomerSpot). Returns
 * `current` itself when nothing changed. useSlots runs it on every change.
 */
export const placeSlots = (
    current: Slots,
    {
        widgets,
        pinnedIds,
        views,
        initialLayout,
        cols,
        placement,
        replacedIds,
        nextZ,
        ghosts = {},
    }: PlaceSlotsArgs,
): Slots => {
    const ids = new Set(widgets.map((widget) => widget.id));
    const byId = new Map(widgets.map((widget) => [widget.id, widget]));

    // A replacement takes over its old card's slot, which stops
    // fading if it had started.
    const prev = Object.entries(replacedIds ?? {}).reduce((acc, [to, from]) => {
        const slot = acc[from];

        return slot && ids.has(to) && !acc[to]
            ? { ...renameKey(acc, from, to), [to]: { ...slot, leaving: false } }
            : acc;
    }, current);
    const next: Slots = {};
    let changed = prev !== current;

    for (const [id, slot] of Object.entries(prev)) {
        if (ids.has(id)) {
            // Same card, possibly new content (an edited text
            // card): the slot re-points at the fresh widget. Its
            // height stays inside what its view allows, so a chart
            // switched to the table view comes back into the
            // grip's range.
            const fresh = byId.get(id)!;
            const { min, max } = heightRange(fresh, resolveCardView(fresh, views[id]).view);
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
        return changed ? next : current;
    }

    // Newcomers stack from the top, dodging the pinned cards…
    const settled: Rect[] = Object.entries(next)
        .filter(([id, slot]) => pinnedIds.includes(id) && !slot.leaving)
        .map(([, slot]) => slot);
    // …and, for the newcomers only, every other live card too, and the
    // placeholders no newcomer names.
    const named = new Set(newcomers.map(placeholderOf));
    const occupied: Rect[] = [
        ...Object.entries(next)
            .filter(([, slot]) => !slot.leaving)
            .map(([, slot]) => slot),
        ...Object.values(ghosts).filter((ghost) => !ghost.leaving && !named.has(ghost.id)),
    ];

    for (const widget of newcomers) {
        // A restored card keeps its saved rect, its width clamped
        // to the kind's range and its height to what its view
        // allows; fresh ones auto-place at their spawn footprint.
        // A derived height refits once the card mounts.
        const claimed = ghosts[placeholderOf(widget) ?? ''];
        const saved = claimed ?? initialLayout?.[widget.id];
        const resolved = resolveCardView(widget, views[widget.id]);
        const rows = heightRange(widget, resolved.view);
        // A card that takes a placeholder's place keeps its rect when it is
        // the kind the placeholder held; another kind takes its own size from
        // the same corner.
        const sameKind = claimed && claimed.type !== null && kindOf(claimed.type) === widget.kind;
        const { w, h } =
            saved && (!claimed || sameKind)
                ? {
                      w: clamp(saved.w, SPAN_MIN[widget.kind].w, SPAN_MAX[widget.kind].w),
                      h: clamp(saved.h, rows.min, rows.max),
                  }
                : spawnSpan(widget, resolved);
        // A saved spot is honoured only while it's free. A card put back
        // later (chat chip → Add) whose old place is taken lands at the
        // nearest free spot, not on top.
        const spot = newcomerSpot({
            turn: questionTurn(widget),
            w,
            h,
            saved: saved ? { col: saved.col, row: saved.row } : null,
            occupied,
            floor: floorItems(next),
            cols,
            placement,
            nearest: (from) => nearestSpot(from, w, h, occupied, MAX_COLS),
        });

        next[widget.id] = { ...spot, w, h, z: nextZ(), widget };
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
};
