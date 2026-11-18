// The 62-dot strips: one value per context on a fixed scale, the median of a group, and a
// deterministic dodge so dots that would overlap stack instead. Dot positions depend only
// on the data, never on the scope, so nothing moves when the reader picks a context.
import type { Context, IndicatorKey, Tier } from '../_data/types.ts';

import { formatPercent, formatPerDollar, formatShare } from './format.ts';
import { debtPerOda, FLOW_YEAR, flowAt, humanitarianShare, inflowShare } from './profile.ts';

export type StripKey = 'odaShare' | 'debtPerOda' | 'humanitarianShare' | IndicatorKey;

/** A strip's axis. Positions run from 0 at `min` to 1 at `max`. */
export type StripScale = { kind: 'linear' | 'log'; min: number; max: number; ticks: number[] };

export type StripSpec = {
    key: StripKey;
    label: string;
    scale: StripScale;
    /** A reference line, such as $1 of debt service per dollar of ODA. */
    reference: number | null;
    format: (value: number) => string;
};

const SHARE_SCALE: StripScale = { kind: 'linear', min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
const PERCENT_SCALE: StripScale = {
    kind: 'linear',
    min: 0,
    max: 100,
    ticks: [0, 25, 50, 75, 100],
};

export const STRIPS: Record<StripKey, StripSpec> = {
    odaShare: {
        key: 'odaShare',
        label: 'ODA as a share of ODA, OOF, remittances, and FDI, 2024',
        scale: SHARE_SCALE,
        reference: null,
        format: formatShare,
    },
    debtPerOda: {
        key: 'debtPerOda',
        label: 'Debt service paid per dollar of ODA, 2024',
        // The ratios run from under a cent to about $30, so the axis is logarithmic, with $1
        // in the middle.
        scale: { kind: 'log', min: 0.01, max: 100, ticks: [0.01, 0.1, 1, 10, 100] },
        reference: 1,
        format: formatPerDollar,
    },
    humanitarianShare: {
        key: 'humanitarianShare',
        label: 'Humanitarian share of ODA, 2024',
        scale: SHARE_SCALE,
        reference: null,
        format: formatShare,
    },
    stunting: {
        key: 'stunting',
        label: 'Children under five stunted',
        scale: PERCENT_SCALE,
        reference: null,
        format: formatPercent,
    },
    water: {
        key: 'water',
        label: 'People using basic drinking water',
        scale: PERCENT_SCALE,
        reference: null,
        format: formatPercent,
    },
    dtp3: {
        key: 'dtp3',
        label: 'Infants with three DTP vaccine doses',
        scale: PERCENT_SCALE,
        reference: null,
        format: formatPercent,
    },
};

/** The living-conditions strips, in page order, on one 0 to 100% axis. */
export const LIVING_STRIPS: readonly IndicatorKey[] = ['stunting', 'water', 'dtp3'];

/** A context's value on a strip and the year it is for, or null where none is held. */
const stripValue = (context: Context, key: StripKey): { value: number; year: number } | null => {
    let value: number | null;

    switch (key) {
        case 'odaShare':
            value = inflowShare(flowAt(context, FLOW_YEAR));
            break;
        case 'debtPerOda':
            value = debtPerOda(flowAt(context, FLOW_YEAR));
            break;
        case 'humanitarianShare':
            value = humanitarianShare(context, FLOW_YEAR);
            break;
        default:
            return context.indicators[key];
    }

    return value === null ? null : { value, year: FLOW_YEAR };
};

/** A value's place on a scale, 0 to 1, clamped; `clipped` where it falls outside. */
export const scalePosition = (
    scale: StripScale,
    value: number,
): { x: number; clipped: boolean } => {
    const raw =
        scale.kind === 'log'
            ? value <= 0
                ? Number.NEGATIVE_INFINITY
                : (Math.log10(value) - Math.log10(scale.min)) /
                  (Math.log10(scale.max) - Math.log10(scale.min))
            : (value - scale.min) / (scale.max - scale.min);
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

export type StripDot = {
    iso3: string;
    name: string;
    tier: Tier;
    value: number;
    year: number;
    /** 0 to 1 along the axis. */
    x: number;
    /** The value lies outside the axis and is drawn at its end. */
    clipped: boolean;
    /** The dodge lane: 0 on the axis, then 1, −1, 2 and so on, two radii apart. */
    lane: number;
};

export type Strip = {
    spec: StripSpec;
    dots: StripDot[];
    /** The contexts with no value held, by ISO3 code. */
    missing: string[];
};

/**
 * Every context's dot on one strip, with the dodge for dots of `radius` in the axis's
 * normalised units (the dot's radius over the axis's length).
 */
export const buildStrip = (contexts: readonly Context[], key: StripKey, radius: number): Strip => {
    const spec = STRIPS[key];
    const held = contexts.flatMap((context) => {
        const reading = stripValue(context, key);

        return reading === null
            ? []
            : [{ context, ...reading, ...scalePosition(spec.scale, reading.value) }];
    });
    const lanes = dodge(
        held.map(({ context, x }) => ({ id: context.iso3, x })),
        radius,
    );

    return {
        spec,
        dots: held.map(({ context, value, year, x, clipped }) => ({
            iso3: context.iso3,
            name: context.name,
            tier: context.tier,
            value,
            year,
            x,
            clipped,
            lane: lanes.get(context.iso3) ?? 0,
        })),
        missing: contexts
            .filter((context) => stripValue(context, key) === null)
            .map((context) => context.iso3),
    };
};

/** The median of the values held, or null where none is. */
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

/** The median of a strip over `contexts`, the scope's group, with how many hold a value. */
export const stripMedian = (
    contexts: readonly Context[],
    key: StripKey,
): { value: number | null; count: number } => {
    const values = contexts.flatMap((context) => {
        const reading = stripValue(context, key);

        return reading === null ? [] : [reading.value];
    });

    return { value: median(values), count: values.length };
};
