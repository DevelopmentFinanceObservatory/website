import { chartFromTable, type ChartWidget, type Widget } from '@/lib/chat/widgets';

/**
 * The whiteboard's geometry: cells, card footprints, the free-spot search
 * and the "what does this card read as" helpers. Pure functions and
 * constants — no React, no DOM.
 *
 * Whiteboard cells ARE the pattern cells. Their px size is fluid (GRID_CELL
 * scaled by the root font-size — see useGridCell), so cards keep their
 * proportions against rem-sized content on any screen. Every card spans an
 * exact number of cells per kind, so its edges always land on grid lines.
 */

// Cells kept clear around auto-placed cards.
export const GAP = 1;
// The sheet has no fixed size — it grows with the content, right and down.
// MAX_COLS is only a distant sanity cap for the placement math.
export const MAX_COLS = 500;

// Card footprints in cells: cards SPAWN at the default size, and the corner
// grip can only take them between min and max.
export const SPAN_DEFAULT: Record<Widget['kind'], { w: number; h: number }> = {
    key_number: { w: 13, h: 8 },
    chart: { w: 22, h: 14 },
    table: { w: 22, h: 14 },
    text: { w: 14, h: 4 },
};

export const SPAN_MIN: Record<Widget['kind'], { w: number; h: number }> = {
    key_number: { w: 11, h: 7 },
    chart: { w: 22, h: 13 },
    table: { w: 22, h: 13 },
    text: { w: 14, h: 3 },
};

export const SPAN_MAX: Record<Widget['kind'], { w: number; h: number }> = {
    key_number: { w: 16, h: 11 },
    chart: { w: 34, h: 21 },
    table: { w: 34, h: 21 },
    text: { w: 14, h: 60 },
};

// Card-type filter tab → widget kind; everything else on the sheet fades down.
export const FILTER_KIND: Record<string, Widget['kind']> = {
    stats: 'key_number',
    charts: 'chart',
    tables: 'table',
    notes: 'text',
};

export type Rect = { col: number; row: number; w: number; h: number };
export type Spot = { col: number; row: number };

// A placed card. The slot carries its widget's data, so a card replaced by a
// newer turn (`leaving`) can keep rendering while it fades out.
export type Slot = Rect & { z: number; widget: Widget; leaving?: boolean };
export type Slots = Record<string, Slot>;

// How long a replaced card lingers while fading (matches the CSS opacity
// transition, with margin).
export const LEAVE_MS = 400;

export const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

// Cards always keep GAP cells of air between each other.
export const tooCloseRects = (a: Rect, b: Rect) =>
    !(
        a.col >= b.col + b.w + GAP ||
        b.col >= a.col + a.w + GAP ||
        a.row >= b.row + b.h + GAP ||
        b.row >= a.row + a.h + GAP
    );

// First free spot scanning left→right, top→bottom, from the very corner —
// the GAP cells of air apply BETWEEN cards (tooCloseRects), not to the
// edges. The sheet grows downward, so the row scan is open-ended.
export const findSpot = (w: number, h: number, taken: Rect[], cols: number): Spot => {
    const maxCol = Math.max(0, cols - w);

    for (let row = 0; row < 400; row++) {
        for (let col = 0; col <= maxCol; col++) {
            if (!taken.some((other) => tooCloseRects({ col, row, w, h }, other))) {
                return { col, row };
            }
        }
    }

    return { col: 0, row: 0 };
};

// Candidate offsets sorted by distance, precomputed once — the landing logic
// walks this list to find the nearest spot where a card actually fits.
const NEAR_OFFSETS: [number, number][] = (() => {
    const offsets: [number, number][] = [];

    for (let dy = -24; dy <= 24; dy++) {
        for (let dx = -24; dx <= 24; dx++) {
            offsets.push([dx, dy]);
        }
    }

    return offsets.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
})();

// Nearest spot to `desired` where a w×h card fits among `others` — walking
// the distance-sorted offsets means a landing hint never just vanishes; it
// slides to wherever the card can actually settle.
export const nearestSpot = (
    desired: Spot,
    w: number,
    h: number,
    others: Rect[],
    cols: number,
): Spot | null => {
    const maxCol = Math.max(0, cols - w);

    for (const [dx, dy] of NEAR_OFFSETS) {
        const col = desired.col + dx;
        const row = desired.row + dy;

        if (col < 0 || col > maxCol || row < 0) {
            continue;
        }

        if (!others.some((other) => tooCloseRects({ col, row, w, h }, other))) {
            return { col, row };
        }
    }

    return null;
};

// The live cards' rects, minus `exclude` — the geometry helpers work on
// plain lists; leaving cards are already gone as far as layout goes.
export const liveRects = (slots: Slots, exclude: string[] = []): Rect[] =>
    Object.entries(slots)
        .filter(([id, slot]) => !exclude.includes(id) && !slot.leaving)
        .map(([, slot]) => slot as Rect);

// Post-move settling: anchors (and pinned cards) hold their ground, every
// other card that got crowded slides to its nearest fit. `movePinned`:
// pinned cards normally hold their ground (walls for a resize), but a USER
// edit — a text card growing to its content — is allowed to nudge them: pin
// protects against incoming widgets, not against the user's own actions.
export const settleAround = (
    next: Slots,
    anchors: string[],
    pinnedIds: string[],
    movePinned = false,
): Slots => {
    const holds = (id: string) => anchors.includes(id) || (!movePinned && pinnedIds.includes(id));
    const settled: Rect[] = Object.entries(next)
        .filter(([id, s]) => !s.leaving && holds(id))
        .map(([, s]) => s);
    const others = Object.entries(next)
        .filter(([id, s]) => !s.leaving && !holds(id))
        .sort(([, a], [, b]) => a.row - b.row || a.col - b.col);

    for (const [id, s] of others) {
        if (settled.some((rect) => tooCloseRects(s, rect))) {
            const spot = nearestSpot({ col: s.col, row: s.row }, s.w, s.h, settled, MAX_COLS) ?? {
                col: s.col,
                row: s.row,
            };

            next[id] = { ...s, col: spot.col, row: spot.row };
        }

        settled.push(next[id]!);
    }

    return next;
};

// --- What a card reads as -----------------------------------------------------

// How the card's data is currently visualised (the menu's type switcher).
export type CardView = 'chart-bar' | 'chart-line' | 'chart-table';

// The kind a card currently READS as: its API kind, unless the switcher has
// re-visualised it (a chart shown as a table filters as a table, and vice
// versa). Filters and the dynamic tabs go by this, not the raw kind.
export const effectiveKind = (widget: Widget, view?: CardView): Widget['kind'] => {
    if (widget.kind === 'key_number' || widget.kind === 'text' || !view) {
        return widget.kind;
    }

    return view === 'chart-table' ? 'table' : 'chart';
};

export const widgetTitle = (widget: Widget): string =>
    widget.kind === 'key_number' ? widget.label : widget.title;

// The chartable form of a card's data: itself for charts, derived for
// tables, null when it can't chart (no varying dimension to label bars with).
export const chartSourceOf = (widget: Widget): ChartWidget | null =>
    widget.kind === 'chart' ? widget : widget.kind === 'table' ? chartFromTable(widget) : null;

// The card's current view: null = no switcher (a lone number, a note, or a
// table whose data can't chart); otherwise the user's pick or the
// natural default. A line needs at least two points — a saved 'chart-line'
// on one-point data falls back to bars.
export const resolveCardView = (
    widget: Widget,
    picked: CardView | undefined,
): { view: CardView | null; choices: CardView[]; chartSource: ChartWidget | null } => {
    const chartSource = chartSourceOf(widget);

    if (!chartSource) {
        return { view: null, choices: [], chartSource: null };
    }

    const lineable = chartSource.categories.length > 1;
    const natural: CardView =
        widget.kind === 'table'
            ? 'chart-table'
            : widget.kind === 'chart' && widget.chartType === 'line'
              ? 'chart-line'
              : 'chart-bar';
    const raw = picked ?? natural;

    return {
        view: raw === 'chart-line' && !lineable ? 'chart-bar' : raw,
        choices: lineable
            ? ['chart-bar', 'chart-line', 'chart-table']
            : ['chart-bar', 'chart-table'],
        chartSource,
    };
};
