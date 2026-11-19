// Bar chart geometry that does not depend on pixels: the stacked layers, their extent, and
// the axis ticks.
import type { ProviderKey, ProviderSeries } from '../_data/types.ts';

import { PROVIDERS } from './providers.ts';

/** One stacked layer: values by year, positive above the axis, negative below. */
export type Layer = { key: ProviderKey; colour: string; values: (number | null)[] };

/** The bars' layers, bottom to top: the United States, the Global Fund, all others. */
export const providerLayers = (series: ProviderSeries): Layer[] =>
    PROVIDERS.map(({ key, colour }) => ({ key, colour, values: series[key] }));

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
