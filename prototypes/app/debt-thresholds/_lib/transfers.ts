// Net transfers on external debt, grouped the way the scatter groups countries. Pure
// functions over `_data/transfers.json`, so the chart, its heading and the tests read
// the same sums. Only type imports, which keeps the module loadable by `node --test`.
import type { Group } from './thresholds.ts';

/** One member of the 75, as `_data/transfers.json` keeps it: the rows carry no names or groups. */
export type TransferMember = { iso3: string; name: string; group: string };

/** The `data` of `_data/transfers.json`: the membership and the release label. */
export type TransfersMembers = {
    /** The IDS release the values come from, e.g. "November 2026". */
    release: string;
    countries: TransferMember[];
};

/** The members with their net transfers by year, built in the browser from the transfers ref. */
export type TransfersData = {
    release: string;
    years: number[];
    /** Every member, in membership order, with its net transfers by year, null where missing. */
    countries: (TransferMember & { values: (number | null)[] })[];
};

/** A transfers row. The port reads `financingRecipient`, `time_period` and `value`. */
export type TransferRow = Record<string, unknown>;

/** The year in a `time_period`, read as Python's `int(str(value))` reads it. */
const wholeYear = (value: unknown): number => {
    const text = String(value).trim();

    if (!/^[+-]?\d+$/.test(text)) {
        throw new Error(`time_period ${JSON.stringify(text)} is not a whole year.`);
    }

    return Number(text);
};

/** The first year kept, as `_data/pipeline/transfers.py`'s FIRST_YEAR. */
export const FIRST_YEAR = 2010;

/**
 * Port of `values_by_country`: each country's value by year from `FIRST_YEAR` on,
 * skipping null values. A country with no rows is absent.
 *
 * @throws When a row's `time_period` is not a whole year, as Python's `int()` refuses it,
 *   or when no row survives, as the Python step does.
 */
export const valuesByCountry = (rows: TransferRow[]): Map<string, Map<number, number>> => {
    const values = new Map<string, Map<number, number>>();
    let kept = 0;

    for (const row of rows) {
        const year = wholeYear(row['time_period']);

        if (year < FIRST_YEAR || row['value'] === null || row['value'] === undefined) {
            continue;
        }

        const iso3 = String(row['financingRecipient']).replace(/^country\//, '');
        const byYear = values.get(iso3) ?? new Map<number, number>();

        byYear.set(year, Number(row['value']));
        values.set(iso3, byYear);
        kept += 1;
    }

    if (kept === 0) {
        throw new Error(`The fetch returned no values from ${FIRST_YEAR} on.`);
    }

    return values;
};

/**
 * Port of `last_actual_year`: the latest year that at least half of the countries
 * with any value report. Later years are incomplete.
 */
export const lastActualYear = (values: Map<string, Map<number, number>>): number => {
    const counts = new Map<number, number>();

    for (const byYear of values.values()) {
        for (const year of byYear.keys()) {
            counts.set(year, (counts.get(year) ?? 0) + 1);
        }
    }

    const half = values.size / 2;
    const years = [...counts].filter(([, count]) => count >= half).map(([year]) => year);

    if (years.length === 0) {
        throw new Error('No year is reported by half of the countries.');
    }

    return Math.max(...years);
};

/** Port of `transfers_by_country`: the members' values on the years `FIRST_YEAR` to the last actual one. */
export const transfersByCountry = (
    rows: TransferRow[],
    { release, countries }: TransfersMembers,
): TransfersData => {
    const values = valuesByCountry(rows);
    const last = lastActualYear(values);
    const years = Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

    return {
        release,
        years,
        countries: countries.map((member) => ({
            ...member,
            values: years.map((year) => values.get(member.iso3)?.get(year) ?? null),
        })),
    };
};

/** A scatter group, or `outside` for countries not in FDL's 58. */
export type LineKey = Group | 'outside';

export type TransferLine = {
    key: LineKey;
    /** Members' ISO3 codes, sorted, without the set-aside country. */
    members: string[];
    /** The members' sum by year, null in a year where none reports. */
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
