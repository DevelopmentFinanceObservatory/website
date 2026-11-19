// Bar chart geometry that does not depend on pixels: the stacked layers, their extent, and
// the axis ticks.
import type { ProviderKey, ProviderSeries } from '../_data/types.ts';

import { GF_MULTI, PROVIDERS } from './providers.ts';

export type LayerKey = ProviderKey | typeof GF_MULTI.key;

/**
 * One stacked layer: values by year, positive above the axis, negative below. A hatched
 * layer holds money only partly for HIV and stays out of the totals.
 */
export type Layer = {
    key: LayerKey;
    colour: string;
    values: readonly (number | null)[];
    hatched: boolean;
};

/** The bars' layers, bottom to top: the United States, the Global Fund, all others. */
export const providerLayers = (series: ProviderSeries): Layer[] =>
    PROVIDERS.map(({ key, colour }) => ({ key, colour, values: series[key], hatched: false }));

/** The hatched layer of Global Fund multi-disease grants, stacked above `providerLayers`. */
export const multiLayer = (values: readonly number[]): Layer => ({
    key: GF_MULTI.key,
    colour: GF_MULTI.colour,
    values,
    hatched: true,
});

/** The first year the Global Fund recorded most of its HIV grants under code 13040. Before
 *  it, combined HIV and TB grants sat under 12250, so the bars jump between 2019 and 2020. */
export const BREAK_YEAR = 2020;

/** The short label on the break between `BREAK_YEAR - 1` and `BREAK_YEAR`. */
export const BREAK_LABEL = 'Global Fund reporting change';

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

/** The bars' axis reaches at least this, in US dollars, so a country with a few thousand
 *  dollars gets ticks such as "$250k" in place of several that all read "$0k". */
export const BAR_AXIS_FLOOR = 1_000_000;

/** The bars' axis ticks: from 0 to at least the tallest stack and at least `BAR_AXIS_FLOOR`. */
export const barTicks = (high: number): number[] => valueTicks(0, Math.max(high, BAR_AXIS_FLOOR));

/**
 * The indices of the years to label on an axis of `count` years where labels need
 * `step` years between them: the first and the last always, and every `step`th counting
 * back from the last, leaving out any that would sit within `step` of the first.
 */
export const labelledYears = (count: number, step: number): Set<number> => {
    const last = count - 1;
    const labelled = new Set<number>(count > 0 ? [0, last] : []);

    for (let index = last - step; index >= step; index -= step) {
        labelled.add(index);
    }

    return labelled;
};

/**
 * Axis ticks from the lower of 0 and `low` to at least `high`, on a step of 1, 2, 2.5
 * or 5 times a power of ten that gives about `count` intervals.
 */
export const valueTicks = (low: number, high: number, count = 4): number[] => {
    const from = Math.min(0, low);
    // With nothing above the floor, the axis still spans one unit, which keeps the step above zero.
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
