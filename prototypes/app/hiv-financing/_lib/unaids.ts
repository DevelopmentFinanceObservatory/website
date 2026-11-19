// The UNAIDS figures by country, derived in the browser from the rows of the pinned reads in
// _data/live-refs.json. A port of `unaids_by_country` in _data/fetch.py; unaids.test.mts checks
// it against the rows and figures the step writes to _data/unaids-fixture.json.
import type { Country, UnaidsFigures } from '../_data/types.ts';

/** A country with its UNAIDS figures joined on. */
export type UnaidsCountry = Country & UnaidsFigures;

/** What the UNAIDS notes read: a country's name with its figures. */
export type NamedFigures = Pick<Country, 'iso3' | 'name'> & UnaidsFigures;

/** One row of a read, as `Dataset.toRows()` gives it. */
export type UnaidsRow = Readonly<Record<string, unknown>>;

/** The rows of the three reads, keyed as in live-refs.json. */
export type UnaidsRows = {
    plhiv: readonly UnaidsRow[];
    art: readonly UnaidsRow[];
    deaths: readonly UnaidsRow[];
};

const COUNTRY = 'country/';

/**
 * Rounds as Python's `round(value, digits)` does: to the nearest, with an exact half going to
 * the even digit. An exact half at `digits` places is an odd multiple of 2^-(digits + 1), so
 * the test for one is exact in binary; every other value rounds as `toFixed` does, from its
 * exact binary value.
 */
export const pythonRound = (value: number, digits = 0): number => {
    if (!Number.isFinite(value)) {
        throw new Error(`cannot round ${value}`);
    }

    const sign = value < 0 ? -1 : 1;
    const magnitude = Math.abs(value);
    const halves = magnitude * 2 ** (digits + 1);
    // toFixed takes the larger of two equally near numbers.
    const up = Number(magnitude.toFixed(digits));

    if (!Number.isInteger(halves) || halves % 2 === 0) {
        return sign * up;
    }

    const lastDigit = Math.round(up * 10 ** digits) % 10;

    return sign * (lastDigit % 2 === 0 ? up : Number((up - 10 ** -digits).toFixed(digits)));
};

/** Why the rows of a read gave no figures: a second row for one place and year, or a row whose
 *  year or value is neither a number nor, for the value, null. */
export type UnaidsRowsErrorCode = 'unaids_repeated_year' | 'unaids_unreadable_row';

/** The rows of a read break what `unaidsByCountry` assumes. */
export class UnaidsRowsError extends Error {
    readonly code: UnaidsRowsErrorCode;

    constructor(code: UnaidsRowsErrorCode, message: string) {
        super(message);
        this.name = 'UnaidsRowsError';
        this.code = code;
    }
}

/** A read's values by year for one place. A row with a null or NaN value counts as no figure,
 *  as `yearly` in fetch.py reads it. */
const yearly = (rows: readonly UnaidsRow[], place: string): Map<number, number> => {
    const values = new Map<number, number>();

    for (const row of rows) {
        if (row.observationAbout !== place) {
            continue;
        }

        const { time_period: year, value } = row;

        if (value === null || Number.isNaN(value)) {
            continue;
        }

        if (typeof year !== 'number' || typeof value !== 'number') {
            throw new UnaidsRowsError(
                'unaids_unreadable_row',
                `${place}: a row with time_period ${String(year)} and value ${String(value)}`,
            );
        }

        if (values.has(year)) {
            throw new UnaidsRowsError(
                'unaids_repeated_year',
                `${place}: more than one row for ${year}`,
            );
        }

        values.set(year, value);
    }

    return values;
};

/**
 * The UNAIDS figures the page shows for each of `iso3s`, from the rows of the three reads.
 * A row counts for a country when its `observationAbout` is exactly `country/<iso3>`, so the
 * regions and other places in the reads drop out. People living with HIV and treatment
 * coverage are the last year's, rounded to a whole number and to one decimal; deaths are one
 * per year of `years`, rounded to a whole number. A missing figure is null.
 *
 * @throws {UnaidsRowsError} A place has two rows for one year, or a row it cannot read.
 */
export const unaidsByCountry = (
    iso3s: readonly string[],
    rows: UnaidsRows,
    years: readonly number[],
): Record<string, UnaidsFigures> => {
    const last = years.at(-1);

    if (last === undefined) {
        throw new Error('no years');
    }

    return Object.fromEntries(
        iso3s.map((iso3) => {
            const place = COUNTRY + iso3;
            const [people, coverage, died] = [rows.plhiv, rows.art, rows.deaths].map((read) =>
                yearly(read, place),
            );
            const at = (values: Map<number, number> | undefined, year: number, digits = 0) => {
                const value = values?.get(year);

                return value === undefined ? null : pythonRound(value, digits);
            };

            return [
                iso3,
                {
                    plhiv: at(people, last),
                    art: at(coverage, last, 1),
                    deaths: years.map((year) => at(died, year)),
                },
            ];
        }),
    );
};

/** Each country with its figures, or with every figure null where `figures` is null (before
 *  the reads arrive, or after they fail) or lacks the country. */
export const joinUnaids = <TCountry extends Pick<Country, 'iso3'>>(
    countries: readonly TCountry[],
    figures: Readonly<Record<string, UnaidsFigures>> | null,
    years: readonly number[],
): (TCountry & UnaidsFigures)[] =>
    countries.map((country) => ({
        ...country,
        ...(figures?.[country.iso3] ?? {
            plhiv: null,
            art: null,
            deaths: years.map(() => null),
        }),
    }));
