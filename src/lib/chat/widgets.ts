/**
 * Canvas widgets: the shapes every card renders from, whatever produced them
 * (an agent's component, or the user's own text card).
 */

import { cellNumber, compact, type StatValue } from '../studio/statFace.ts';

/** One source a card cites, as the platform names it. */
export type CardSource = {
    // The source's id, which the graph's own documentation is looked up by.
    id: string;
    name: string;
    licence: string | null;
    url: string | null;
    retrieved: string | null;
};

/**
 * What the card's chrome shows and its More Info panel unfolds: the
 * attribution line, the window, the indicators behind the card, the
 * citation and every source it came from, all read straight off the component
 * frame. `citation` and `sources` are absent on a card saved before they
 * were recorded.
 */
export type CardInfo = {
    // The frame's own one-line attribution ("WorldDevelopmentIndicators · 1 indicator(s)").
    label: string;
    sourceId: string | null;
    sourceName: string | null;
    sourceCount: number;
    indicatorCount: number;
    years: { start: string; end: string } | null;
    // The unit in words with its magnitude and price basis ("US Dollar, millions,
    // constant 2023 prices").
    unit: string | null;
    indicators: { id: string; name: string; description: string }[];
    licence: string | null;
    dataThrough: string | null;
    lastRefreshed: string | null;
    citation?: string | null;
    sources?: CardSource[];
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

// Axis tick abbreviation for charts.
export const formatAxis = (value: number): string => compact(value);

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
