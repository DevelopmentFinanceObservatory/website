// Chart geometry that does not depend on pixels: stacked layers, extents, axis ticks, and
// what a key reads for a hovered year.
import type { FlowKey, SummedPillars, SummedSeries } from './groups.ts';

/** One stacked layer: signed values by year, positive above the axis, negative below. */
export type Layer = { key: string; colour: string; values: (number | null)[] };

export const FLOW_COLOURS = {
    oda: '#6467de',
    // A light tint of the ODA indigo: official money, set apart from ODA, remittances, FDI
    // and the peace pillar's tint by lightness as well as hue.
    oof: '#bdbef2',
    remittances: '#2a9d8f',
    fdi: '#c9a227',
    fdiOutflow: '#7a5f0e',
    debtService: '#f6935a',
} as const;

/** The pillars partition ODA, so they are three tints of the ODA indigo. */
export const PILLAR_COLOURS = {
    development: '#6467de',
    humanitarian: '#2e2f8a',
    peace: '#a3a4ea',
} as const;

/**
 * The money chart's layers: ODA, OOF, remittances and FDI inflows stacked up, debt service and
 * net FDI outflows stacked down. A missing figure is null.
 */
export const flowLayers = (flows: Record<FlowKey, SummedSeries>): Layer[] => {
    const fdi = flows.fdi.values;

    return [
        { key: 'oda', colour: FLOW_COLOURS.oda, values: flows.oda.values },
        { key: 'oof', colour: FLOW_COLOURS.oof, values: flows.oof.values },
        { key: 'remittances', colour: FLOW_COLOURS.remittances, values: flows.remittances.values },
        {
            key: 'fdi',
            colour: FLOW_COLOURS.fdi,
            values: fdi.map((value) => (value === null || value < 0 ? null : value)),
        },
        {
            key: 'debtService',
            colour: FLOW_COLOURS.debtService,
            values: flows.debtService.values.map((value) => (value === null ? null : -value)),
        },
        {
            key: 'fdiOutflow',
            colour: FLOW_COLOURS.fdiOutflow,
            values: fdi.map((value) => (value !== null && value < 0 ? value : null)),
        },
    ];
};

/** The aid chart's layers; a year without aid recorded is null. */
export const pillarLayers = (pillars: SummedPillars): Layer[] =>
    (['development', 'humanitarian', 'peace'] as const).map((key) => ({
        key,
        colour: PILLAR_COLOURS[key],
        values: pillars.values[key],
    }));

/** The tallest stack above the axis and the deepest below it across the years. */
export const stackExtent = (layers: readonly Layer[]): { low: number; high: number } => {
    const count = Math.max(0, ...layers.map((layer) => layer.values.length));
    let low = 0;
    let high = 0;

    for (let index = 0; index < count; index += 1) {
        let up = 0;
        let down = 0;

        for (const layer of layers) {
            const value = layer.values[index] ?? 0;

            if (value > 0) {
                up += value;
            } else {
                down += value;
            }
        }

        high = Math.max(high, up);
        low = Math.min(low, down);
    }

    return { low, high };
};

/**
 * Axis ticks from the lower of 0 and `low` to at least `high`, on a step of 1, 2, 2.5
 * or 5 times a power of ten that gives about `count` intervals.
 */
export const valueTicks = (low: number, high: number, count = 4): number[] => {
    const from = Math.min(0, low);
    // With nothing above the floor, the axis still spans one unit, so it never divides by zero.
    const to = Math.max(0, high) > from ? Math.max(0, high) : from + 1;
    const raw = (to - from) / count;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / magnitude;
    const step =
        (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
    const ticks: number[] = [];

    for (let index = Math.floor(from / step); index * step < to + step * 0.999; index += 1) {
        ticks.push(index * step);
    }

    return ticks;
};

/**
 * What a key reads for one series in a hovered year. `held`: the year's figure. `latest`:
 * the year is after the series ends, so the key shows its last figure with that year.
 * `gap`: the year sits inside the series' span with no figure ("No data"). `before`: the
 * year is before the series starts, or the series is empty.
 */
export type Reading =
    | { kind: 'held'; year: number; value: number }
    | { kind: 'latest'; year: number; value: number }
    | { kind: 'gap' }
    | { kind: 'before' };

export const readingAt = (
    points: readonly { year: number; value: number | null }[],
    year: number,
): Reading => {
    const held = points.filter(
        (point): point is { year: number; value: number } => point.value !== null,
    );
    const first = held[0];
    const last = held.at(-1);

    if (first === undefined || last === undefined || year < first.year) {
        return { kind: 'before' };
    }

    if (year > last.year) {
        return { kind: 'latest', year: last.year, value: last.value };
    }

    const point = held.find((candidate) => candidate.year === year);

    return point === undefined ? { kind: 'gap' } : { kind: 'held', year, value: point.value };
};
