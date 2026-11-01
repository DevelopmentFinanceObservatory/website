/**
 * Canvas widgets: the shapes every card renders from, whatever produced them
 * (an agent's component, or the user's own text card).
 */

import { asRecord } from '../asRecord.ts';
import { isComputedBy, isInputSource } from '../studio/descriptionBlocks.ts';
import {
    cellNumber,
    compact,
    isPercentUnit,
    percentNumber,
    type StatValue,
} from '../studio/statFace.ts';

/** One source a card cites, as the platform names it. */
export type CardSource = {
    // The source's id, which the graph's own documentation is looked up by;
    // null for a computed version's input whose id is unknown.
    id: string | null;
    name: string;
    licence: string | null;
    url: string | null;
    retrieved: string | null;
};

/**
 * What the card's chrome shows and its More Info panel unfolds: the
 * attribution line, the window, the citation and every source it came from,
 * all read straight off the component frame. `citation` and `sources` are
 * absent on a card saved before they were recorded, and `leftOut` on a card
 * whose data leaves nothing out.
 */
export type CardInfo = {
    // The frame's own one-line attribution ("WorldDevelopmentIndicators · 1 indicator(s)").
    label: string;
    // The first source with a known id.
    sourceId: string | null;
    sourceName: string | null;
    sourceCount: number;
    indicatorCount: number;
    years: { start: string; end: string } | null;
    // The unit in words with its magnitude and price basis ("US Dollar, millions,
    // constant 2023 prices").
    unit: string | null;
    // The indicators behind the card, present only on a card saved with them.
    // The legacy More Info lists them one by one.
    indicators?: { id: string; name: string; description: string }[];
    licence: string | null;
    dataThrough: string | null;
    lastRefreshed: string | null;
    citation?: string | null;
    sources?: CardSource[];
    // What the card's data leaves out, one sentence per gap in the platform's
    // words, such as the series a rolling period holds no value for or a
    // scope the frame covers less than. A live share's card and its More Info
    // show it.
    leftOut?: string[];
    // The card's stored description, which More Info renders with no request.
    // Absent on a card issued without one and on one saved before it existed,
    // whose More Info renders the fields above. A saved card holds whatever
    // JSON was saved, so readers take it through `cardDescription`.
    description?: unknown;
};

/** The component revision a Studio card draws. Download Data and a share
 *  name the card by it. */
export type CardRef = { component_id: string; revision: number };

/** The frame a Studio card draws from: a `spec_` dataset, or an `ops_`
 *  frame derived from others. */
export type FrameRef = { spec_id: string; content_version: string };

/**
 * The values a card shows, unrounded, one row per value. Each column has a
 * machine `key` (`series`, `period`, `value`, `unit`, or a table's own
 * dimension key) and a display `label`; each row holds one cell per column,
 * `null` where the card shows none.
 */
export type CardData = {
    columns: { key: string; label: string }[];
    rows: (string | number | null)[][];
};

export type KeyNumberWidget = {
    kind: 'key_number';
    id: string;
    label: string;
    // The headline as text, display-rounded ("441.9", "23.4M", "12.3%").
    value: string;
    // The unit in words ("US Dollar").
    unit?: string;
    // The raw headline the card face is drawn from (see statFace). A card
    // saved before it was kept has none, and its face reads `value`, `unit`
    // and the display text in `period` and `change` ("+1.9% from 2023 to 2024").
    stat?: StatValue;
    period?: string;
    change?: string;
    ref?: CardRef;
    frame?: FrameRef;
    data?: CardData;
    source?: string;
    info?: CardInfo;
};

export type ChartWidget = {
    kind: 'chart';
    id: string;
    chartType: 'line' | 'bar';
    title: string;
    unit?: string;
    categories: string[];
    series: { label: string; values: (number | null)[] }[];
    /** Bars run along the value axis, categories down the side: a comparison
     *  of named things at one moment rather than a run over time. */
    horizontal?: boolean;
    ref?: CardRef;
    frame?: FrameRef;
    data?: CardData;
    source?: string;
    info?: CardInfo;
};

export type TableWidget = {
    kind: 'table';
    id: string;
    title: string;
    columns: string[];
    rows: string[][];
    ref?: CardRef;
    frame?: FrameRef;
    data?: CardData;
    source?: string;
    info?: CardInfo;
};

// A user-authored note on the canvas (Add Text Card) — local only, never
// from the agent; carries no data or source.
export type TextWidget = {
    kind: 'text';
    id: string;
    title: string;
    body: string;
    source?: undefined;
    info?: undefined;
};

export type Widget = KeyNumberWidget | ChartWidget | TableWidget | TextWidget;

// Series names can carry long parentheticals ("… (current US$)") — chart
// category labels drop them.
const shortLabel = (label: string): string => label.replace(/\s*\(.*?\)/g, '').trim() || label;

/** A chart's value-axis tick and tooltip number in the chart's unit: a
 *  percentage with a % sign ("5.33%"), any other value compacted ("37.0K"). */
export const formatAxis = (value: number, unit?: string): string =>
    isPercentUnit(unit) ? `${percentNumber(value)}%` : compact(value);

/** A card's source credit, read as the lead, the first name, then "+{more} more":
 *  "Source: OECD CRS", "Sources: OECD CRS +1 more", or "Source: DFO
 *  calculation" for a computed card that credits no source. More Info lists
 *  every source in full. */
export type SourceCredit = {
    lead: string;
    // The first source's name, which the card links; null on a computed card
    // that names no source.
    first: string | null;
    // How many further sources the card cites.
    more: number;
};

// The count the harness appends to a frame's attribution label ("IDS; WDI ·
// 2 indicator(s)", "OECD DAC1 · 1 indicator"), and the placeholder the label
// holds when the frame names no source.
const LABEL_COUNT = /\s*·\s*\d+ indicators?(?:\(s\))?$/;
const UNKNOWN_SOURCE = 'Unknown source';

// The sources a frame's attribution label names, its count dropped.
const labelSources = (label: string): string | null => {
    const name = label.replace(LABEL_COUNT, '').trim();

    return name && name !== UNKNOWN_SOURCE ? name : null;
};

// What the card face reads of a stored description, from the saved JSON
// without a full read: whether DFO computed the card, and the names of the
// sources it credits. A computed version's inputs record what it read and
// credit no one. Null for a card that carries no description.
const describedCredit = (description: unknown): { computed: boolean; names: string[] } | null => {
    const stored = asRecord(description);

    if (!stored) {
        return null;
    }

    const sources = Array.isArray(stored['sources']) ? stored['sources'] : [];

    return {
        computed: isComputedBy(
            asRecord(stored['describes'])?.['kind'],
            asRecord(stored['cite'])?.['id'],
        ),
        names: sources.flatMap((value) => {
            const source = asRecord(value);
            const label = source?.['label'];

            return source && typeof label === 'string' && label && !isInputSource(source)
                ? [label]
                : [];
        }),
    };
};

/** The card's source credit, or null when the card names no source and DFO
 *  did not compute it. Each source counts once. A described card credits its
 *  description's sources, a computed card's inputs left out, and a computed
 *  card that credits none credits DFO's calculation. The bar's "Built with"
 *  mark and More Info credit DFO already, so a named source stands alone. A
 *  card without one credits its sources, else the one source a card saved before its
 *  sources were kept held, else what its attribution label names. */
export const sourceLine = (
    info: Pick<CardInfo, 'sources' | 'sourceName' | 'label' | 'description'>,
): SourceCredit | null => {
    const described = describedCredit(info.description);
    const listed = described ? described.names : (info.sources?.map((source) => source.name) ?? []);
    const fallback = described ? null : (info.sourceName ?? labelSources(info.label));
    const [first = fallback, ...rest] = [...new Set(listed)];

    if (first === null) {
        return described?.computed ? { lead: 'Source: DFO calculation', first, more: 0 } : null;
    }

    return { lead: rest.length > 0 ? 'Sources:' : 'Source:', first, more: rest.length };
};

/**
 * View conversions for the card-type switcher. Both directions run on data
 * the widget already carries, and the converted widget keeps the card's
 * revision, frame, values, source and info, so Download Data and More Info
 * work in either view.
 */

type Carried = Pick<TableWidget, 'ref' | 'frame' | 'data' | 'source' | 'info'>;

const carried = (widget: ChartWidget | TableWidget): Carried => ({
    ref: widget.ref,
    frame: widget.frame,
    data: widget.data,
    source: widget.source,
    info: widget.info,
});

// A chart shown as a table: categories down, one column per series, except
// a single-category chart (one year, many series), which reads better
// transposed: one row per series.
export const tableFromChart = (widget: ChartWidget): TableWidget => {
    if (widget.categories.length === 1 && widget.series.length > 1) {
        return {
            kind: 'table',
            id: widget.id,
            title: widget.title,
            columns: ['', widget.categories[0]!],
            rows: widget.series.map((series) => [
                series.label,
                series.values[0] != null ? cellNumber(series.values[0]!) : '—',
            ]),
            ...carried(widget),
        };
    }

    return {
        kind: 'table',
        id: widget.id,
        title: widget.title,
        columns: ['', ...widget.series.map((series) => series.label)],
        rows: widget.categories.map((category, index) => [
            category,
            ...widget.series.map((series) => {
                const value = series.values[index];

                return value != null ? cellNumber(value) : '—';
            }),
        ]),
        ...carried(widget),
    };
};

// Columns that describe a value rather than place it.
const VALUE_KEYS = new Set(['value', 'unit']);

const cellText = (cell: CardData['rows'][number][number]): string =>
    cell == null ? '' : String(cell);

// True when a column holds more than one value across the rows. A column
// empty on every row holds one value, the empty one.
const varies = (data: CardData, index: number): boolean =>
    new Set(data.rows.map((row) => cellText(row[index]))).size > 1;

// The text a constant column holds on every row, or undefined when it varies
// or is empty.
const constantOf = (data: CardData, index: number): string | undefined =>
    varies(data, index) ? undefined : cellText(data.rows[0]?.[index]) || undefined;

/**
 * A table shown as a bar chart, from its structured `data`: the `value`
 * column plotted along the table's period, or its first varying column when
 * the period is constant, with one series per combination of the other
 * varying columns. Null when the data has no value column, nothing varies
 * to label the bars with, the unit varies, or two rows share a series and
 * category, since one bar cannot show either.
 */
export const chartFromTable = (widget: TableWidget): ChartWidget | null => {
    const { data } = widget;
    const keys = data?.columns.map(({ key }) => key) ?? [];
    const valueAt = keys.indexOf('value');

    const unitAt = keys.indexOf('unit');

    if (!data?.rows.length || valueAt < 0 || (unitAt >= 0 && varies(data, unitAt))) {
        return null;
    }

    const varying = keys.flatMap((key, index) =>
        !VALUE_KEYS.has(key) && varies(data, index) ? [index] : [],
    );
    const periodAt = keys.indexOf('period');
    const categoryAt = varying.includes(periodAt) ? periodAt : varying[0];

    if (categoryAt === undefined) {
        return null;
    }

    const seriesAt = varying.filter((index) => index !== categoryAt);
    const seriesOf = (row: CardData['rows'][number]): string =>
        seriesAt.map((index) => cellText(row[index])).join(' · ');
    const categories = [...new Set(data.rows.map((row) => cellText(row[categoryAt])))];
    const labels = [...new Set(data.rows.map(seriesOf))];
    const values = new Map<string, number | null>();

    for (const row of data.rows) {
        const key = JSON.stringify([seriesOf(row), cellText(row[categoryAt])]);
        const value = row[valueAt];

        if (values.has(key)) {
            return null;
        }

        values.set(key, typeof value === 'number' ? value : null);
    }

    // A lone series is named after the card's constant `series` column, so
    // it reads as the indicator, and otherwise after the value column.
    const seriesKeyAt = keys.indexOf('series');
    const loneLabel =
        (seriesKeyAt >= 0 && constantOf(data, seriesKeyAt)) || data.columns[valueAt]!.label;

    return {
        kind: 'chart',
        id: widget.id,
        chartType: 'bar',
        title: widget.title,
        unit: unitAt >= 0 ? constantOf(data, unitAt) : undefined,
        categories: categories.map(shortLabel),
        series: labels.map((label) => ({
            label: seriesAt.length ? label : shortLabel(loneLabel),
            values: categories.map(
                (category) => values.get(JSON.stringify([label, category])) ?? null,
            ),
        })),
        ...carried(widget),
    };
};
