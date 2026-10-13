/**
 * Studio-v1 components → canvas Widgets. A card draws the component the
 * platform resolved, which the frame's `payload` carries (see payload.ts):
 * a chart its series and points, a table its rows, a stat card its value,
 * period, unit and change. A payload without them (the
 * `stored_intent` shape, a scatter chart) falls back to a sketch from the
 * fact summary: each series' `first` / `last` over `window`.
 *
 * Every data card carries `ref`, the component revision it draws, `frame`,
 * the frame it draws from, and `data`, the values it shows, unrounded.
 */

import type {
    CardData,
    CardInfo,
    CardRef,
    CardSource,
    ChartWidget,
    KeyNumberWidget,
    TableWidget,
    TextWidget,
    Widget,
} from '../chat/widgets';
import { comparison } from './comparison.ts';
import {
    asUnit,
    describedBy,
    payloadChart,
    payloadDescription,
    payloadFrameRef,
    payloadNoteText,
    payloadProvenance,
    payloadStat,
    payloadTable,
    payloadTitle,
    type DescriptionRead,
    type PayloadChart,
    type PayloadProvenance,
    type PayloadStat,
    type PayloadTable,
    type PayloadUnit,
    type StructuredUnit,
} from './payload.ts';
import type { Description } from './description.ts';
import { gapsOf, licenceWords } from './descriptionBlocks.ts';
import { formatPeriod } from './period.ts';
import {
    cellNumber,
    faceText,
    statFace,
    unitDescription,
    unitWords,
    type StatValue,
} from './statFace.ts';
import type { ComponentCreated, ComponentRevised, FactSummary } from './wire';

const structuredUnitText = (unit: StructuredUnit): string => {
    const amount = [
        unit.currency,
        unit.magnitude && unit.magnitude !== 'units' ? unit.magnitude : null,
    ].filter(Boolean);
    const basis = [unit.prices, unit.base_year].filter((part) => part != null).join(' ');

    return [amount.join(' '), basis && `(${basis})`].filter(Boolean).join(' ');
};

// A payload unit as text: a plain label as it stands, a currency amount as
// "USD millions (constant 2023)", a composed unit as the info panel words it
// ("US Dollar per Total population").
const payloadUnitText = (unit: PayloadUnit | undefined): string | undefined => {
    if (unit === undefined || typeof unit === 'string') {
        return unit;
    }

    if ('numerator' in unit) {
        return unitDescription(unit) ?? undefined;
    }

    return structuredUnitText(unit) || undefined;
};

// The payload names the card's own title. Attribution backstops.
const titleOf = (payload: Record<string, unknown>, facts: FactSummary): string =>
    payloadTitle(payload) ?? facts.series[0]?.label ?? facts.attribution.label;

// The two periods the frame's numbers describe: the window's ends (or a
// series' own change bounds when no window shipped).
const periodsOf = (facts: FactSummary): string[] => {
    if (facts.window) {
        const { start, end } = facts.window;

        return start === end ? [start] : [start, end];
    }

    const change = facts.series[0]?.change;

    if (change) {
        return change.from_period === change.to_period
            ? [change.from_period]
            : [change.from_period, change.to_period];
    }

    return [];
};

type SeriesEntry = ChartWidget['series'][number];

const seriesValues = (facts: FactSummary, periods: string[]): SeriesEntry[] =>
    facts.series.map((series) => ({
        label: series.label,
        values:
            periods.length === 1
                ? [series.last ?? series.first ?? null]
                : [series.first ?? null, series.last ?? null],
    }));

// --- Data: the values a card shows -----------------------------------------

const UNIT_COLUMN = { key: 'unit', label: 'Unit' };

const SERIES_COLUMNS: CardData['columns'] = [
    { key: 'series', label: 'Series' },
    { key: 'period', label: 'Period' },
    { key: 'value', label: 'Value' },
    UNIT_COLUMN,
];

// A chart's valued points, one row each, series by series in payload order.
// An entity-mode bar chart shows each series once, at the shared period.
const chartData = (chart: PayloadChart): CardData => ({
    columns: SERIES_COLUMNS,
    rows: chart.series.flatMap((series) =>
        series.points
            .filter(
                (point) =>
                    point.value != null &&
                    (!chart.entityPeriod || point.period === chart.entityPeriod),
            )
            .map((point) => [
                series.label,
                point.period,
                point.value,
                payloadUnitText(series.unit) ?? null,
            ]),
    ),
});

// A table's rows in its own columns, then each row's unit: a table can mix
// stat_vars with different units. A status cell has no value.
const tableData = (table: PayloadTable): CardData => ({
    columns: [...table.columns, UNIT_COLUMN],
    rows: table.rows.map((row) => [
        ...table.columns.map(({ key }) => {
            if (key === 'period') {
                return row.period;
            }

            if (key === 'value') {
                return row.value;
            }

            return row.dimensions[key] ?? null;
        }),
        payloadUnitText(row.unit) ?? null,
    ]),
});

const statData = (stat: PayloadStat): CardData => ({
    columns: SERIES_COLUMNS,
    rows: [[stat.label, stat.period, stat.value, payloadUnitText(stat.unit) ?? null]],
});

// The fact-summary sketch's values: each series' first and last over the window.
const sketchData = (facts: FactSummary): CardData => {
    const periods = periodsOf(facts);
    const unit = payloadUnitText(asUnit(facts.unit)) ?? null;

    return {
        columns: SERIES_COLUMNS,
        rows: seriesValues(facts, periods).flatMap((series) =>
            series.values.flatMap((value, index) =>
                value != null ? [[series.label, periods[index] ?? null, value, unit]] : [],
            ),
        ),
    };
};

// --- Drawing ----------------------------------------------------------------

// What a chart card plots: categories along the axis, one value per
// category in each series.
type Plot = Pick<ChartWidget, 'categories' | 'series'>;

// The fact-summary sketch: each series' first and last value over the
// window. Null when the summary names no period.
const sketchPlot = (facts: FactSummary): Plot | null => {
    const periods = periodsOf(facts);

    return periods.length ? { categories: periods, series: seriesValues(facts, periods) } : null;
};

// The payload's resolved chart. An entity-mode bar chart draws one bar per
// series, labelled by the series, at its one shared period; every other
// chart draws each series across the periods its points cover.
const payloadPlot = (chart: PayloadChart): Plot => {
    const { entityPeriod } = chart;

    if (entityPeriod) {
        return {
            categories: chart.series.map((series) => series.label),
            series: [
                {
                    label: formatPeriod(entityPeriod),
                    values: chart.series.map(
                        (series) =>
                            series.points.find((point) => point.period === entityPeriod)?.value ??
                            null,
                    ),
                },
            ],
        };
    }

    // Periods are ISO dates of one grain, so they sort as strings.
    const categories = [
        ...new Set(chart.series.flatMap((series) => series.points.map((point) => point.period))),
    ].sort();

    return {
        categories: categories.map(formatPeriod),
        series: chart.series.map((series) => {
            const byPeriod = new Map(series.points.map((point) => [point.period, point.value]));

            return {
                label: series.label,
                values: categories.map((period) => byPeriod.get(period) ?? null),
            };
        }),
    };
};

// A table card's cells: the sketch pivots periods down and series across.
type Cells = Pick<TableWidget, 'columns' | 'rows'>;

const sketchCells = (facts: FactSummary): Cells | null => {
    const plot = sketchPlot(facts);

    if (!plot) {
        return null;
    }

    return {
        columns: ['Period', ...plot.series.map((entry) => entry.label)],
        rows: plot.categories.map((period, index) => [
            period,
            ...plot.series.map((entry) => {
                const value = entry.values[index];

                return value != null ? cellNumber(value) : '—';
            }),
        ]),
    };
};

const STATUS_LABELS: Record<string, string> = {
    missing: 'Missing',
    suppressed: 'Suppressed',
    not_applicable: 'Not applicable',
};

// The payload's resolved table, row for row, in its own column order. A
// Unit column joins before Value when the rows mix units, as a table over
// GDP and population does. A status row names its status in the Value cell.
const payloadCells = (table: PayloadTable): Cells => {
    const units = table.rows.map((row) => payloadUnitText(row.unit));
    const columns =
        new Set(units).size > 1
            ? table.columns.flatMap((column) =>
                  column.key === 'value' ? [UNIT_COLUMN, column] : [column],
              )
            : table.columns;

    return {
        columns: columns.map((column) => column.label),
        rows: table.rows.map((row, index) =>
            columns.map((column) => {
                const { key } = column;

                if (key === 'period') {
                    return formatPeriod(row.period);
                }

                if (key === 'value') {
                    if (row.value != null) {
                        return cellNumber(row.value);
                    }

                    return row.status ? (STATUS_LABELS[row.status] ?? row.status) : '—';
                }

                if (column === UNIT_COLUMN) {
                    return units[index] ?? '—';
                }

                return row.dimensions[key] ?? '—';
            }),
        ),
    };
};

type StatFields = Pick<KeyNumberWidget, 'value' | 'unit' | 'period' | 'change' | 'stat'>;

// The headline the card face is drawn from, with its number and unit words
// as text for the places that print them inline. `period` and `change` are
// cleared so a redrawn card saved before `stat` keeps none of its old text.
const statFields = (stat: StatValue): StatFields => ({
    stat,
    value: faceText(statFace(stat)),
    unit: unitWords(stat.unit) ?? undefined,
    period: undefined,
    change: undefined,
});

const payloadStatFields = ({ value, period, unit, change }: PayloadStat): StatFields =>
    statFields({ value, period, unit, change });

// The `stored_intent` payload's stat card: the newest value the summary offers.
const sketchStatFields = (facts: FactSummary): StatFields => {
    const series = facts.series[0];
    const value = series?.last ?? series?.first ?? null;

    return value != null ? statFields({ value, unit: asUnit(facts.unit) }) : { value: '—' };
};

// --- Widgets ----------------------------------------------------------------

const refOf = (frame: ComponentCreated | ComponentRevised): CardRef => ({
    component_id: frame.component_id,
    revision: frame.revision,
});

const statWidget = (frame: ComponentCreated): KeyNumberWidget => {
    const stat = payloadStat(frame.payload);

    return {
        kind: 'key_number',
        id: frame.component_id,
        label: titleOf(frame.payload, frame.fact_summary),
        ...(stat ? payloadStatFields(stat) : sketchStatFields(frame.fact_summary)),
        ref: refOf(frame),
        data: stat ? statData(stat) : sketchData(frame.fact_summary),
        source: frame.fact_summary.attribution.label,
    };
};

const chartWidget = (frame: ComponentCreated): ChartWidget | null => {
    const facts = frame.fact_summary;
    const chart = payloadChart(frame.payload);
    const plot = chart ? payloadPlot(chart) : sketchPlot(facts);

    if (!plot) {
        return null;
    }

    return comparison(
        {
            kind: 'chart',
            id: frame.component_id,
            chartType: frame.type === 'bar_chart' ? 'bar' : 'line',
            title: titleOf(frame.payload, facts),
            unit: payloadUnitText(asUnit(facts.unit)),
            ...plot,
            ref: refOf(frame),
            data: chart ? chartData(chart) : sketchData(facts),
            source: facts.attribution.label,
        },
        plot.categories,
        plot.series,
        chart?.entityPeriod,
    );
};

const tableWidget = (frame: ComponentCreated): TableWidget | null => {
    const facts = frame.fact_summary;
    const table = payloadTable(frame.payload);
    const cells = table ? payloadCells(table) : sketchCells(facts);

    return cells
        ? {
              kind: 'table',
              id: frame.component_id,
              title: titleOf(frame.payload, facts),
              ...cells,
              ref: refOf(frame),
              data: table ? tableData(table) : sketchData(facts),
              source: facts.attribution.label,
          }
        : null;
};

const noteWidget = (frame: ComponentCreated): TextWidget => ({
    kind: 'text',
    id: frame.component_id,
    title: titleOf(frame.payload, frame.fact_summary),
    body: payloadNoteText(frame.payload) ?? '',
});

// The platform says so in as many words when it has no licence.
const licenceOf = (licence: string | null | undefined): string | null =>
    licence && !/not stated|^unknown$/i.test(licence.trim()) ? licence : null;

/** What a created card cites. The platform's provenance from the resolved
 *  payload, the same one a revised card reads, when every payload source
 *  names its graph dcid in `ref`; otherwise the frame's own provenance, whose
 *  source ids are the dcids. Freshness the chosen provenance leaves null
 *  falls back to the frame's, field by field. */
const provenanceOf = (frame: ComponentCreated): PayloadProvenance => {
    const { citation, sources, freshness } = frame.provenance;
    const own: PayloadProvenance = {
        citation: citation || null,
        sources,
        dataThrough: freshness?.data_through ?? null,
        lastRefreshed: freshness?.last_refreshed ?? null,
        // Only the resolved payload states its warnings by kind.
        leftOut: [],
    };
    const platform = payloadProvenance(frame.payload);
    const chosen =
        platform?.sources.length && platform.sources.every((source) => source.ref) ? platform : own;

    return {
        ...chosen,
        dataThrough: chosen.dataThrough ?? own.dataThrough,
        lastRefreshed: chosen.lastRefreshed ?? own.lastRefreshed,
        leftOut: platform?.leftOut ?? [],
    };
};

// The provenance of a described card's envelope, which holds lineage only:
// its sources, freshness, warnings and citation live in the description.
const LINEAGE_ONLY: PayloadProvenance = {
    citation: null,
    sources: [],
    dataThrough: null,
    lastRefreshed: null,
    leftOut: [],
};

// One line of a source card: "OECD CRS — OECD (CC BY 4.0)".
const sourceCardLine = (name: string, publisher: string | null, licence: string | null): string =>
    `${name}${publisher ? ` — ${publisher}` : ''} (${licence ?? 'licence not stated'})`;

// A described source card's lines, from its description, which is its
// source's document.
const describedSourceLines = (description: Description): string[] => {
    const gaps = gapsOf(description);

    return description.sources.map((source, index) =>
        sourceCardLine(
            source.label,
            source.publisher ?? null,
            licenceWords(description, index, gaps),
        ),
    );
};

/** A source card: one line per source, from its description when it carries
 *  one, else from provenance. */
const sourceWidget = (
    frame: ComponentCreated,
    description: Description | undefined,
): TextWidget => {
    const lines = description
        ? describedSourceLines(description)
        : provenanceOf(frame).sources.map((source) =>
              sourceCardLine(source.name, source.publisher ?? null, licenceOf(source.licence)),
          );

    return {
        kind: 'text',
        id: frame.component_id,
        title: titleOf(frame.payload, frame.fact_summary),
        body: lines.join('\n'),
    };
};

// The unit the More Info panel names, from the fact summary.
const infoUnit = (facts: FactSummary): string | null => unitDescription(asUnit(facts.unit));

// A described card's sources, from its description: the card face, Download
// Data and analytics name them as they name a legacy card's.
const describedSources = (description: Description): CardSource[] =>
    description.sources.map((source) => ({
        id: source.ref,
        name: source.label,
        licence: source.licence ?? null,
        url: null,
        retrieved: null,
    }));

/** The card's More Info payload: attribution, window and unit from the fact
 *  summary; the citation, freshness and what the data leaves out
 *  from provenance; and the stored description when the payload carries one.
 *  The sources come from the description on a described card. A legacy card
 *  takes them from provenance, and the panel fetches the graph's own name
 *  for each later, by the source's dcid: its `ref` where it has one, else
 *  its id. */
const infoOf = (
    facts: FactSummary,
    provenance: PayloadProvenance,
    description: Description | undefined,
): CardInfo => {
    const sources: CardSource[] = description
        ? describedSources(description)
        : provenance.sources.map((source) => ({
              id: source.ref ?? source.id,
              name: source.name,
              licence: licenceOf(source.licence),
              url: source.url || null,
              retrieved: source.retrieved ?? null,
          }));
    const first = sources[0];

    return {
        label: facts.attribution.label,
        sourceId: sources.find((source) => source.id !== null)?.id ?? null,
        sourceName: first?.name ?? null,
        sourceCount: facts.attribution.source_count,
        indicatorCount: facts.attribution.indicator_count,
        years: facts.window ?? null,
        unit: infoUnit(facts),
        licence: first?.licence ?? null,
        dataThrough: provenance.dataThrough,
        lastRefreshed: provenance.lastRefreshed,
        citation: provenance.citation,
        sources,
        ...(provenance.leftOut.length > 0 ? { leftOut: provenance.leftOut } : {}),
        ...(description ? { description } : {}),
    };
};

const componentWidget = (
    frame: ComponentCreated,
    description: Description | undefined,
): Widget | null => {
    switch (frame.type) {
        case 'stat_card':
            return statWidget(frame);
        // Our chart atom draws lines and bars; a scatter reads acceptably as
        // a line until a native scatter view lands.
        case 'line_chart':
        case 'bar_chart':
        case 'scatter_chart':
            return chartWidget(frame);
        case 'table':
            return tableWidget(frame);
        case 'note_user':
        case 'note_narration':
            return noteWidget(frame);
        case 'source_card':
            return sourceWidget(frame, description);
        default:
            return null;
    }
};

/** One created component → one canvas widget. */
export const widgetFromComponent = (frame: ComponentCreated): Widget | null => {
    const description = describedBy(payloadDescription(frame.payload));
    const widget = componentWidget(frame, description);

    if (!widget || widget.kind === 'text') {
        // A note carries no data of its own, so it gets no info panel.
        return widget;
    }

    return {
        ...widget,
        frame: payloadFrameRef(frame.payload) ?? frame.provenance.inputs[0],
        info: infoOf(frame.fact_summary, provenanceOf(frame), description),
    };
};

// The held widget redrawn from a payload of its own kind; undefined when
// the payload holds no resolved component of that kind.
const redraw = (widget: Widget, payload: Record<string, unknown>): Widget | undefined => {
    switch (widget.kind) {
        case 'key_number': {
            const stat = payloadStat(payload);

            return stat && { ...widget, ...payloadStatFields(stat), data: statData(stat) };
        }
        case 'chart': {
            const chart = payloadChart(payload);

            if (!chart) {
                return undefined;
            }

            const plot = payloadPlot(chart);

            return comparison(
                { ...widget, ...plot, data: chartData(chart) },
                plot.categories,
                plot.series,
                chart.entityPeriod,
            );
        }
        case 'table': {
            const table = payloadTable(payload);

            return table && { ...widget, ...payloadCells(table), data: tableData(table) };
        }
        case 'text': {
            const body = payloadNoteText(payload);

            return body !== undefined ? { ...widget, body } : undefined;
        }
    }
};

const retitle = (widget: Widget, title: string): Widget =>
    widget.kind === 'key_number' ? { ...widget, label: title } : { ...widget, title };

/**
 * Apply a `component.revised` frame to the widget we hold. Only a payload
 * replaces what the card shows: its title, and its drawing, values and ref
 * when the payload resolves a component of the card's kind. A frame without
 * a payload leaves the card as it is; useChat then reads the revision by id
 * and applies its payload here. `read` is the payload's description as its
 * frame's reader took it; a caller that has read it passes it on.
 *
 * A payload with provenance or a description rebuilds the card's info from
 * its own facts. A refused description counts, so the card's More Info
 * falls back to the legacy panel over the new data and drops the previous
 * revision's description.
 */
export const reviseWidget = (
    widget: Widget,
    frame: ComponentRevised,
    read: DescriptionRead | undefined = payloadDescription(frame.payload),
): Widget => {
    const { payload } = frame;

    if (!payload) {
        return widget;
    }

    const title = payloadTitle(payload);
    const titled = title ? retitle(widget, title) : widget;
    const redrawn = redraw(titled, payload);

    if (!redrawn || redrawn.kind === 'text') {
        return redrawn ?? titled;
    }

    const provenance = payloadProvenance(payload);

    return {
        ...redrawn,
        ...(redrawn.kind === 'chart'
            ? { unit: payloadUnitText(asUnit(frame.fact_summary.unit)) }
            : {}),
        ref: refOf(frame),
        frame: payloadFrameRef(payload) ?? redrawn.frame,
        source: frame.fact_summary.attribution.label,
        ...(provenance || read
            ? {
                  info: infoOf(frame.fact_summary, provenance ?? LINEAGE_ONLY, describedBy(read)),
              }
            : redrawn.info && { info: { ...redrawn.info, unit: infoUnit(frame.fact_summary) } }),
    };
};
