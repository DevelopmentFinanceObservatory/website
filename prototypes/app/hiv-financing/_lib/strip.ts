// The dot strip of last-year aid per person living with HIV: which countries it holds, its
// scale and median, and a deterministic dodge so dots that would overlap stack instead.
import { valueTicks } from './chart.ts';
import { aidPerPerson } from './summary.ts';
import type { UnaidsCountry } from './unaids.ts';

/** The strip holds countries with at least this many people living with HIV. */
export const STRIP_MIN_PLHIV = 50_000;

export type PerPersonPoint = { iso3: string; name: string; value: number };

/**
 * Last-year aid per person living with HIV, in US dollars, for countries with `min` or
 * more people living with HIV and some aid in the last year, in ascending order of value,
 * then name.
 */
export const perPersonPoints = (
    countries: readonly UnaidsCountry[],
    min = STRIP_MIN_PLHIV,
): PerPersonPoint[] =>
    countries
        .flatMap((country) => {
            const value = aidPerPerson(country);

            return value !== null && value > 0 && (country.plhiv ?? 0) >= min
                ? [{ iso3: country.iso3, name: country.name, value }]
                : [];
        })
        .toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name));

/** The median of the values, the mean of the middle two for an even count, or null for none. */
export const median = (values: readonly number[]): number | null => {
    const sorted = values.toSorted((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length === 0) {
        return null;
    }

    return sorted.length % 2 === 1
        ? (sorted[middle] ?? null)
        : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** A linear axis. Positions run from 0 at `min` to 1 at `max`. */
export type StripScale = { min: number; max: number; ticks: number[] };

/** From $0 to the first tick at or above the largest value. */
export const stripScale = (values: readonly number[]): StripScale => {
    const ticks = valueTicks(0, Math.max(0, ...values));

    return { min: 0, max: ticks.at(-1) ?? 1, ticks };
};

/** A value's place on a scale, 0 to 1 and clamped, with `clipped` set where it falls outside. */
export const scalePosition = (
    scale: StripScale,
    value: number,
): { x: number; clipped: boolean } => {
    const raw = (value - scale.min) / (scale.max - scale.min);
    const x = Math.min(1, Math.max(0, raw));

    return { x, clipped: x !== raw };
};

/**
 * Lanes for dots of `radius` at positions `x`, both in the axis's normalised units. Dots are
 * placed by position, then id, each in the first free lane of 0, 1, −1, 2, −2 and so on,
 * where a lane is free when no dot already in it lies within two radii. Lanes sit two
 * radii apart, so no two dots overlap. The same input always gives the same lanes.
 */
export const dodge = (
    items: readonly { id: string; x: number }[],
    radius: number,
): Map<string, number> => {
    const lanes = new Map<string, number>();
    const placed: { x: number; lane: number }[] = [];
    const order = items.toSorted((a, b) => a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    for (const item of order) {
        let lane = 0;

        for (let step = 1; ; step += 1) {
            const taken = placed.some(
                (other) => other.lane === lane && Math.abs(other.x - item.x) < 2 * radius,
            );

            if (!taken) {
                break;
            }

            lane = step % 2 === 1 ? (step + 1) / 2 : -step / 2;
        }

        placed.push({ x: item.x, lane });
        lanes.set(item.id, lane);
    }

    return lanes;
};

export type StripDot = PerPersonPoint & {
    /** 0 to 1 along the axis. */
    x: number;
    /** The value lies outside the axis and is drawn at its end. */
    clipped: boolean;
    /** The dodge lane: 0 on the axis, then 1, −1, 2 and so on, two radii apart. */
    lane: number;
};

export type Strip = {
    scale: StripScale;
    dots: StripDot[];
    /** the median of the dots' values; null when the strip is empty */
    median: number | null;
};

/**
 * The strip over `countries`, with the dodge for dots of `radius` in the axis's normalised
 * units (the dot's radius over the axis's length). Dot positions depend only on the data,
 * so nothing moves when the reader picks a country.
 */
export const buildStrip = (countries: readonly UnaidsCountry[], radius: number): Strip => {
    const points = perPersonPoints(countries);
    const values = points.map((point) => point.value);
    const scale = stripScale(values);
    const placed = points.map((point) => ({ ...point, ...scalePosition(scale, point.value) }));
    const lanes = dodge(
        placed.map(({ iso3, x }) => ({ id: iso3, x })),
        radius,
    );

    return {
        scale,
        dots: placed.map((dot) => ({ ...dot, lane: lanes.get(dot.iso3) ?? 0 })),
        median: median(values),
    };
};
