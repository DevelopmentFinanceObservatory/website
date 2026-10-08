/**
 * Pure readers over a `component.created`/`component.revised` frame's
 * `payload`. The platform's resolved revision envelope
 * (`{schema_version, catalog_version, component_id, revision, provenance,
 * component}`) is read first. The older `{stored_intent, fact_summary}`
 * shape an earlier harness sends is the fallback. See wire.ts's `payload`
 * field comment.
 */

import type { Source, SpecRef } from './wire.ts';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
    value !== null && typeof value === 'object' ? (value as UnknownRecord) : undefined;

const nonBlank = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value : undefined;

const asSpecRef = (value: unknown): SpecRef | undefined => {
    const record = asRecord(value);
    const specId = nonBlank(record?.['spec_id']);
    const contentVersion = nonBlank(record?.['content_version']);

    return specId && contentVersion
        ? { spec_id: specId, content_version: contentVersion }
        : undefined;
};

/** The frame a card draws from is the envelope's first provenance input
 *  (empty for a note, which has no data spec), or the `stored_intent`
 *  payload's `frame_ref`. */
export const payloadFrameRef = (payload: UnknownRecord | null | undefined): SpecRef | undefined => {
    const inputs = asRecord(payload?.['provenance'])?.['inputs'];
    const envelopeRef = asSpecRef(Array.isArray(inputs) ? inputs[0] : undefined);

    return envelopeRef ?? asSpecRef(asRecord(payload?.['stored_intent'])?.['frame_ref']);
};

/** The card's own title is the envelope's `component.title.text` (present
 *  on chart, table, stat and source cards, absent on a note), or the old
 *  payload's `stored_intent.title`. */
export const payloadTitle = (payload: UnknownRecord | null | undefined): string | undefined => {
    const component = asRecord(payload?.['component']);
    const envelopeTitle = nonBlank(asRecord(component?.['title'])?.['text']);

    return envelopeTitle ?? nonBlank(asRecord(payload?.['stored_intent'])?.['title']);
};

/** A note card's body is the envelope's `component.text`, the old
 *  payload's `stored_intent.text`, or a bare top-level `text`, in that
 *  order. */
export const payloadNoteText = (payload: UnknownRecord | null | undefined): string | undefined => {
    const component = asRecord(payload?.['component']);
    const envelopeText = component?.['text'];

    if (typeof envelopeText === 'string' && envelopeText) {
        return envelopeText;
    }

    const intentText = asRecord(payload?.['stored_intent'])?.['text'];

    if (typeof intentText === 'string' && intentText) {
        return intentText;
    }

    const topText = payload?.['text'];

    return typeof topText === 'string' && topText ? topText : undefined;
};

/** A currency amount: its ISO 4217 code, its magnitude, its price basis
 *  and, for constant prices, the base year. */
export type StructuredUnit = {
    currency: string | null;
    magnitude: string | null;
    prices: string | null;
    base_year: number | null;
};

/** A measure that declares no unit, standing as one side of a composed
 *  unit: its StatVar ref and the graph's name for it. */
export type CountedStatVar = { stat_var: string; label: string };

/** One side of a composed unit. */
export type UnitPart = string | StructuredUnit | CountedStatVar;

/** A resolved unit: a plain label (`"Year"`), a currency amount, or the
 *  unit of a quotient of two measures (US Dollar per Total population). */
export type PayloadUnit = string | StructuredUnit | { numerator: UnitPart; denominator: UnitPart };

const asStructuredUnit = (record: UnknownRecord): StructuredUnit => {
    const baseYear = record['base_year'];

    return {
        currency: nonBlank(record['currency']) ?? null,
        magnitude: nonBlank(record['magnitude']) ?? null,
        prices: nonBlank(record['prices']) ?? null,
        base_year: typeof baseYear === 'number' ? baseYear : null,
    };
};

// A part names something: a label, a StatVar with its label, or a structured
// unit, read as the top-level unit reads it.
const asUnitPart = (value: unknown): UnitPart | undefined => {
    if (typeof value === 'string') {
        return nonBlank(value);
    }

    const record = asRecord(value);

    if (!record) {
        return undefined;
    }

    if ('stat_var' in record) {
        const statVar = nonBlank(record['stat_var']);
        const label = nonBlank(record['label']);

        return statVar && label ? { stat_var: statVar, label } : undefined;
    }

    // A composed unit does not nest.
    return 'numerator' in record || 'denominator' in record ? undefined : asStructuredUnit(record);
};

/** A card's unit, from the payload or the fact summary. An object naming a
 *  numerator or a denominator is a composed unit, and is no unit when
 *  either part is malformed. Any other object reads as a currency amount,
 *  its unrecognised members null. */
export const asUnit = (value: unknown): PayloadUnit | undefined => {
    if (typeof value === 'string') {
        return nonBlank(value);
    }

    const record = asRecord(value);

    if (!record) {
        return undefined;
    }

    if ('numerator' in record || 'denominator' in record) {
        const numerator = asUnitPart(record['numerator']);
        const denominator = asUnitPart(record['denominator']);

        return numerator && denominator ? { numerator, denominator } : undefined;
    }

    return asStructuredUnit(record);
};

/** One plotted point: `value` is null where the platform marked the period
 *  with a `status` (`missing`, `suppressed`, `not_applicable`). */
export type PayloadPoint = { period: string; value: number | null; status?: string };

export type PayloadSeries = { label: string; unit?: PayloadUnit; points: PayloadPoint[] };

/** A line or bar chart's resolved series. `entityPeriod` is set on an
 *  entity-mode bar chart: one bar per series, every bar at that period. */
export type PayloadChart = { series: PayloadSeries[]; entityPeriod?: string };

export type PayloadTableRow = {
    dimensions: Record<string, string>;
    period: string;
    value: number | null;
    status?: string;
    unit?: PayloadUnit;
};

/** A table's resolved columns (dimensions in select order, then `period`
 *  and `value`) and its rows, one per coordinate and period. */
export type PayloadTable = { columns: { key: string; label: string }[]; rows: PayloadTableRow[] };

const asPoint = (value: unknown): PayloadPoint | undefined => {
    const record = asRecord(value);
    const period = nonBlank(record?.['period']);
    const raw = record?.['value'];

    if (!period) {
        return undefined;
    }

    if (typeof raw === 'number') {
        return { period, value: raw };
    }

    const status = nonBlank(record?.['status']);

    return status ? { period, value: null, status } : { period, value: null };
};

const asSeries = (value: unknown): PayloadSeries | undefined => {
    const record = asRecord(value);
    const label = nonBlank(record?.['label']);
    const points = record?.['points'];

    if (!label || !Array.isArray(points)) {
        return undefined;
    }

    const unit = asUnit(record?.['unit']);

    return {
        label,
        ...(unit !== undefined ? { unit } : {}),
        points: points.map(asPoint).filter((point) => point !== undefined),
    };
};

const envelopeComponent = (payload: UnknownRecord | null | undefined, types: string[]) => {
    const component = asRecord(payload?.['component']);

    return typeof component?.['type'] === 'string' && types.includes(component['type'])
        ? component
        : undefined;
};

/** The resolved series of a `line_chart` or `bar_chart` envelope component,
 *  in payload order. Undefined for any other payload, including the older
 *  `stored_intent` shape, which carries no points. */
export const payloadChart = (
    payload: UnknownRecord | null | undefined,
): PayloadChart | undefined => {
    const component = envelopeComponent(payload, ['line_chart', 'bar_chart']);
    const rawSeries = component?.['series'];

    if (!component || !Array.isArray(rawSeries)) {
        return undefined;
    }

    const series = rawSeries.map(asSeries).filter((one) => one !== undefined);

    if (series.length === 0) {
        return undefined;
    }

    const axis = asRecord(component['category_axis']);
    const entityPeriod = axis?.['mode'] === 'entity' ? nonBlank(axis['period']) : undefined;

    return entityPeriod ? { series, entityPeriod } : { series };
};

/** The resolved columns and rows of a `table` envelope component.
 *  Undefined for any other payload. */
export const payloadTable = (
    payload: UnknownRecord | null | undefined,
): PayloadTable | undefined => {
    const component = envelopeComponent(payload, ['table']);
    const rawColumns = component?.['columns'];
    const rawRows = component?.['rows'];

    if (!Array.isArray(rawColumns) || !Array.isArray(rawRows)) {
        return undefined;
    }

    const columns = rawColumns.flatMap((column) => {
        const record = asRecord(column);
        const key = nonBlank(record?.['key']);
        const label = nonBlank(record?.['label']);

        return key && label ? [{ key, label }] : [];
    });
    const rows = rawRows.flatMap((row) => {
        const record = asRecord(row);
        const point = asPoint(row);
        const dimensions = asRecord(record?.['dimensions']) ?? {};

        if (!point) {
            return [];
        }

        return [
            {
                dimensions: Object.fromEntries(
                    Object.entries(dimensions).filter(
                        (entry): entry is [string, string] => typeof entry[1] === 'string',
                    ),
                ),
                ...point,
                unit: asUnit(record?.['unit']),
            },
        ];
    });

    return columns.length && rows.length ? { columns, rows } : undefined;
};

/** How a stat card's change was derived, over which two periods, and by
 *  how much: a percentage for `percent_change`, otherwise in the card's
 *  unit. */
export type PayloadChange = { derivation: string; basis: [string, string]; value: number };

/** A stat card's resolved headline: its value at `period`, the series
 *  label, its unit, and the change when the card asked for one. */
export type PayloadStat = {
    value: number;
    label: string;
    period: string;
    unit?: PayloadUnit;
    change?: PayloadChange;
};

const asChange = (value: unknown): PayloadChange | undefined => {
    const record = asRecord(value);
    const basis = record?.['basis'];
    const from = Array.isArray(basis) ? nonBlank(basis[0]) : undefined;
    const to = Array.isArray(basis) ? nonBlank(basis[1]) : undefined;
    const derivation = nonBlank(record?.['derivation']);
    const amount = record?.['value'];

    return derivation && from && to && typeof amount === 'number'
        ? { derivation, basis: [from, to], value: amount }
        : undefined;
};

/** The resolved headline of a `stat_card` envelope component. Undefined
 *  for any other payload. */
export const payloadStat = (payload: UnknownRecord | null | undefined): PayloadStat | undefined => {
    const component = envelopeComponent(payload, ['stat_card']);
    const value = component?.['value'];
    const label = nonBlank(component?.['label']);
    const period = nonBlank(component?.['period']);

    if (typeof value !== 'number' || !label || !period) {
        return undefined;
    }

    const unit = asUnit(component?.['unit']);
    const change = asChange(component?.['change']);

    return {
        value,
        label,
        period,
        ...(unit !== undefined ? { unit } : {}),
        ...(change ? { change } : {}),
    };
};

/** What the envelope's provenance cites: the citation line, every source,
 *  how fresh the data is, and what the card's data leaves out (the `detail`
 *  of each `coverage_gap` warning, in the platform's words). */
export type PayloadProvenance = {
    citation: string | null;
    sources: Source[];
    dataThrough: string | null;
    lastRefreshed: string | null;
    leftOut: string[];
};

const asSource = (value: unknown): Source | undefined => {
    const record = asRecord(value);
    const id = nonBlank(record?.['id']);
    const name = nonBlank(record?.['name']);

    return id && name
        ? {
              id,
              name,
              licence: nonBlank(record?.['licence']) ?? '',
              publisher: nonBlank(record?.['publisher']) ?? null,
              url: nonBlank(record?.['url']) ?? null,
              retrieved: nonBlank(record?.['retrieved']) ?? null,
              ref: nonBlank(record?.['ref']) ?? null,
          }
        : undefined;
};

/** The envelope's provenance. Undefined for a payload without one, such as
 *  the `stored_intent` shape. */
export const payloadProvenance = (
    payload: UnknownRecord | null | undefined,
): PayloadProvenance | undefined => {
    const provenance = asRecord(payload?.['provenance']);
    const sources = provenance?.['sources'];

    if (!provenance || !Array.isArray(sources)) {
        return undefined;
    }

    const freshness = asRecord(provenance['freshness']);
    const warnings = provenance['warnings'];

    return {
        citation: nonBlank(provenance['citation']) ?? null,
        sources: sources.map(asSource).filter((source) => source !== undefined),
        dataThrough: nonBlank(freshness?.['data_through']) ?? null,
        lastRefreshed: nonBlank(freshness?.['last_refreshed']) ?? null,
        leftOut: (Array.isArray(warnings) ? warnings : [])
            .map(asRecord)
            .filter((warning) => warning?.['kind'] === 'coverage_gap')
            .map((warning) => nonBlank(warning?.['detail']))
            .filter((detail) => detail !== undefined),
    };
};
