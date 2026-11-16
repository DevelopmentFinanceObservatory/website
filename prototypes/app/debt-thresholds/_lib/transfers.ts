// Net transfers on external debt, grouped the way the scatter groups countries. Pure
// functions over `_data/transfers.json`, so the chart, its heading and the tests read
// the same sums. Only type imports, which keeps the module loadable by `node --test`.
import type { Group } from './thresholds.ts';

/** The `data` of `_data/transfers.json`, written by `_data/fetch.py`. */
export type TransfersData = {
    /** The IDS release the values come from, e.g. "November 2026". */
    release: string;
    years: number[];
    /** FDL's groups' totals by year, in current US dollars. The page regroups `countries`. */
    groups: {
        group: string;
        label: string;
        members: number;
        values: (number | null)[];
        reporting: number[];
    }[];
    /** Every country, with FDL's group and its net transfers by year; null where missing. */
    countries: { iso3: string; name: string; group: string; values: (number | null)[] }[];
};

/** A scatter group, or `outside` for countries not in FDL's 58. */
export type LineKey = Group | 'outside';

export type TransferLine = {
    key: LineKey;
    /** Members' ISO3 codes, sorted; the set-aside country is left out. */
    members: string[];
    /** The members' sum by year; null in a year where none reports. */
    values: (number | null)[];
};

export type SetAside = {
    iso3: string;
    name: string;
    /** The line the country would sit in. */
    line: LineKey;
    values: (number | null)[];
};

/** Line order: the scatter legend's, then countries outside FDL's analysis. */
const ORDER: LineKey[] = ['debt', 'service', 'below', 'nodata', 'outside'];

/**
 * India's net transfers swing by up to 73B from one year to the next, which would set
 * the shape of any line holding it, so its line leaves it out and the key lists it apart.
 */
export const SET_ASIDE_ISO3 = 'IND';

const sumByYear = (rows: (number | null)[][], length: number): (number | null)[] =>
    Array.from({ length }, (_, i) => {
        let total: number | null = null;

        for (const values of rows) {
            const value = values[i];

            if (value !== null && value !== undefined) {
                total = (total ?? 0) + value;
            }
        }

        return total;
    });

/**
 * One line per group in `groupOf`'s grouping, in the legend's order; `groupOf` returns
 * null for a country outside FDL's analysis. Groups with no members are left out.
 */
export const groupTransfers = (
    data: TransfersData,
    groupOf: (iso3: string) => Group | null,
): { lines: TransferLine[]; aside: SetAside | null } => {
    const length = data.years.length;
    const keyOf = (iso3: string): LineKey => groupOf(iso3) ?? 'outside';
    const found = data.countries.find((country) => country.iso3 === SET_ASIDE_ISO3);
    const aside: SetAside | null =
        found === undefined
            ? null
            : { iso3: found.iso3, name: found.name, line: keyOf(found.iso3), values: found.values };

    const lines = ORDER.flatMap((key): TransferLine[] => {
        const members = data.countries.filter(
            (country) => country.iso3 !== SET_ASIDE_ISO3 && keyOf(country.iso3) === key,
        );

        if (members.length === 0) {
            return [];
        }

        return [
            {
                key,
                members: members.map((country) => country.iso3).toSorted(),
                values: sumByYear(
                    members.map((country) => country.values),
                    length,
                ),
            },
        ];
    });

    return { lines, aside };
};

/** How many years before the first net outflow the swing looks back for the inflow. */
const LOOKBACK = 5;

/**
 * A line's swing from net inflow to net outflow: the first year it turns negative, the
 * lowest value from then on, and the highest value in the LOOKBACK years before that
 * first negative year. Null when the line never turns negative or has no inflow before.
 */
export const swing = (
    line: TransferLine,
    years: number[],
): { inflow: { year: number; value: number }; outflow: { year: number; value: number } } | null => {
    const first = line.values.findIndex((value) => value !== null && value < 0);

    if (first <= 0) {
        return null;
    }

    let inflow: { year: number; value: number } | null = null;
    let outflow: { year: number; value: number } | null = null;

    for (const [i, value] of line.values.entries()) {
        const year = years[i];

        if (value === null || year === undefined) {
            continue;
        }

        if (i < first && i >= first - LOOKBACK && value > (inflow?.value ?? 0)) {
            inflow = { year, value };
        }

        if (i >= first && value < (outflow?.value ?? 0)) {
            outflow = { year, value };
        }
    }

    return inflow === null || outflow === null ? null : { inflow, outflow };
};

const billions = (value: number): string => `$${(Math.abs(value) / 1e9).toFixed(1)} billion`;

/**
 * The section's heading: the debt-service group's swing from net inflow to net outflow
 * in the grouping on screen, or a plain question when that group never swings.
 */
export const transfersHeading = (lines: TransferLine[], years: number[]): string => {
    const service = lines.find((line) => line.key === 'service');
    const found = service === undefined ? null : swing(service, years);

    if (found === null) {
        return 'How much do these countries borrow, net of what they repay?';
    }

    return `Countries above the debt-service threshold went from a net inflow of ${billions(found.inflow.value)} in ${found.inflow.year} to a net outflow of ${billions(found.outflow.value)} in ${found.outflow.year}.`;
};
