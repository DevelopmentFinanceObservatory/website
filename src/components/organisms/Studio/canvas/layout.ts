import { chartFromTable, type ChartWidget, type Widget } from '@/lib/chat/widgets';
import { estimatedRows, FITTED_ROWS_MAX } from '@/lib/studio/chartFit';

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
//
// That holds for every width, and for the height of a stat card and of a
// table view. A text card and a chart view have a DERIVED height (see
// heightIsDerived): the card reports the rows it needs and the slot takes
// them, between the kind's minimum and FITTED_ROWS_MAX. So `chart.h` and
// `table.h` below are a table view's default and its grip's range, and the
// floor of a chart view.
//
// A stat card's height is budgeted, not guessed (QA-28). At rem(20) a cell,
// its column needs: 32 padding, the title, the 20 gap under it, the number
// at ~27, 6, the caption, then the 16 gap and the source line. The card
// hides its overflow, and that source line was the piece falling off the
// bottom.
//
// So the card is wide rather than tall (QA-25). The source name only has
// `width - 122` to live on — the padding, the "Built with" mark that never
// shrinks, and the icon column — and at 260px that was 138px a line, which
// truncated most names. At 400px it is 278px: the longest name we carry
// ("World Bank International Debt Statistics (IDS)") fits on one line, the
// title stops wrapping too (see .cardStat .cardTitle), and the column comes
// to ~162px, which is what nine cells (180) hold — the leftover gathers
// above the source line, which is pinned to the bottom, so every cell of
// slack shows up there as a hole.
//
// The grip starts there rather than lower: a card whose title and source
// both wrap runs to ~190px and can be dragged taller.
export const SPAN_DEFAULT: Record<Widget['kind'], { w: number; h: number }> = {
    key_number: { w: 20, h: 9 },
    chart: { w: 22, h: 14 },
    table: { w: 22, h: 14 },
    text: { w: 14, h: 4 },
};

export const SPAN_MIN: Record<Widget['kind'], { w: number; h: number }> = {
    key_number: { w: 18, h: 9 },
    chart: { w: 22, h: 13 },
    table: { w: 22, h: 13 },
    text: { w: 14, h: 3 },
};

export const SPAN_MAX: Record<Widget['kind'], { w: number; h: number }> = {
    key_number: { w: 26, h: 13 },
    chart: { w: 34, h: 21 },
    table: { w: 34, h: 21 },
    text: { w: 14, h: FITTED_ROWS_MAX },
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

// Where a crowded card goes: the nearest spot that fits among `settled`, or,
// when nothing within nearestSpot's window does, the first clear row straight
// down. The second always exists (the sheet grows downward), so a card never
// stays on top of another.
export const settleSpot = (rect: Rect, settled: Rect[]): Spot => {
    const near = nearestSpot({ col: rect.col, row: rect.row }, rect.w, rect.h, settled, MAX_COLS);

    if (near) {
        return near;
    }

    let { row } = rect;

    for (;;) {
        const at = { ...rect, row };
        const crowding = settled.filter((other) => tooCloseRects(at, other));

        if (crowding.length === 0) {
            return { col: rect.col, row };
        }

        row = Math.max(...crowding.map((other) => other.row + other.h + GAP));
    }
};

// Post-move settling: anchors (and pinned cards) hold their ground, every
// other card that got crowded slides to its nearest fit. `movePinned`:
// pinned cards normally hold their ground (walls for a resize), but a card
// whose height is derived moves them when it grows to its content. Its
// height is not negotiable, so holding the pinned card would leave the two
// overlapping.
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
            next[id] = { ...s, ...settleSpot(s, settled) };
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
// A table's chart is derived once per widget, so a card that keys on its
// chart's identity (ChartCard's measuring token) sees the same object on
// every render.
const tableCharts = new WeakMap<Widget, ChartWidget | null>();

export const chartSourceOf = (widget: Widget): ChartWidget | null => {
    if (widget.kind === 'chart') {
        return widget;
    }

    if (widget.kind !== 'table') {
        return null;
    }

    let chart = tableCharts.get(widget);

    if (chart === undefined) {
        chart = chartFromTable(widget);
        tableCharts.set(widget, chart);
    }

    return chart;
};

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

// --- Whose height is derived --------------------------------------------------

type ResolvedView = Pick<ReturnType<typeof resolveCardView>, 'view' | 'chartSource'>;

// Whether the card's height follows its content: a text card, and any card
// showing as a chart. `view` is the resolved view (resolveCardView). Such a
// card reports its rows through `onFit`; nothing else sets its height.
export const heightIsDerived = (widget: Widget, view: CardView | null): boolean =>
    widget.kind === 'text' || view === 'chart-bar' || view === 'chart-line';

// The heights in cells a card may take in its current view.
export const heightRange = (
    widget: Widget,
    view: CardView | null,
): { min: number; max: number } => ({
    min: SPAN_MIN[widget.kind].h,
    max: heightIsDerived(widget, view) ? FITTED_ROWS_MAX : SPAN_MAX[widget.kind].h,
});

// The footprint a fresh card spawns at. A chart view takes the height its
// shape is estimated to need at the default width, so the measured fit that
// follows moves it by a cell or two at most.
export const spawnSpan = (
    widget: Widget,
    { view, chartSource }: ResolvedView,
): { w: number; h: number } => {
    const span = SPAN_DEFAULT[widget.kind];

    if (!chartSource || view === null || view === 'chart-table') {
        return span;
    }

    const { min, max } = heightRange(widget, view);

    return {
        w: span.w,
        h: clamp(estimatedRows(chartSource, view === 'chart-line', span.w), min, max),
    };
};
