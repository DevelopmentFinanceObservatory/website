// The country table's rows, their sort, and the CSV download of them.
import type { Country, ProviderKey } from '../_data/types.ts';

import { lastAid, lastShares } from './summary.ts';

export type TableRow = {
    iso3: string;
    name: string;
    /** last-year HIV aid, all providers, in US dollars */
    aid: number;
    /** last-year HIV aid by provider, in US dollars */
    byProvider: Record<ProviderKey, number>;
    /** each provider's share of `aid`; all 0 where `aid` is 0 */
    shares: Record<ProviderKey, number>;
    plhiv: number | null;
    /** last-year aid per person living with HIV, in US dollars */
    perPerson: number | null;
    /** antiretroviral therapy coverage, in percent */
    art: number | null;
    /** AIDS-related deaths in the last year */
    deaths: number | null;
};

export const tableRows = (countries: readonly Country[]): TableRow[] =>
    countries.map((country) => {
        const aid = lastAid(country);

        return {
            iso3: country.iso3,
            name: country.name,
            aid,
            byProvider: {
                us: country.aid.us.at(-1) ?? 0,
                globalFund: country.aid.globalFund.at(-1) ?? 0,
                other: country.aid.other.at(-1) ?? 0,
            },
            shares: lastShares(country.aid),
            plhiv: country.plhiv,
            perPerson: country.plhiv === null || country.plhiv === 0 ? null : aid / country.plhiv,
            art: country.art,
            deaths: country.deaths.at(-1) ?? null,
        };
    });

/** A sortable column. `mix` sorts on the US share. */
export type SortKey = 'name' | 'aid' | 'mix' | 'plhiv' | 'perPerson' | 'art' | 'deaths';

/** The values `aria-sort` takes, so a header can pass its direction straight through. */
export type SortDirection = 'ascending' | 'descending';

/** The table opens on HIV aid, largest first. */
export const DEFAULT_SORT: { key: SortKey; direction: SortDirection } = {
    key: 'aid',
    direction: 'descending',
};

/** A column's direction on its first click: names A to Z, numbers largest first. */
export const firstDirection = (key: SortKey): SortDirection =>
    key === 'name' ? 'ascending' : 'descending';

const sortValue = (row: TableRow, key: Exclude<SortKey, 'name'>): number | null =>
    key === 'mix' ? row.shares.us : row[key];

/** Rows in order of `key`, missing values last in either direction, ties by name. */
export const sortRows = (
    rows: readonly TableRow[],
    key: SortKey,
    direction: SortDirection,
): TableRow[] => {
    const sign = direction === 'ascending' ? 1 : -1;
    const byName = (a: TableRow, b: TableRow): number => a.name.localeCompare(b.name);

    if (key === 'name') {
        return rows.toSorted((a, b) => sign * byName(a, b));
    }

    return rows.toSorted((a, b) => {
        const [va, vb] = [sortValue(a, key), sortValue(b, key)];

        if (va === null || vb === null) {
            return Number(va === null) - Number(vb === null) || byName(a, b);
        }

        return sign * (va - vb) || byName(a, b);
    });
};

export const csvHeader = (year: number): string[] => [
    'iso3',
    'country',
    `hiv_aid_${year}_usd`,
    `us_${year}_usd`,
    `global_fund_${year}_usd`,
    `other_${year}_usd`,
    `people_living_with_hiv_${year}`,
    `aid_per_person_${year}_usd`,
    `art_coverage_${year}_pct`,
    `aids_deaths_${year}`,
];

const csvCell = (value: string | number | null): string => {
    const text = value === null ? '' : String(value);

    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * One line per row, in the order given, with raw numbers: dollars, people and deaths as
 * held, aid per person to the cent. A missing value is an empty cell. RFC 4180 quoting,
 * CRLF line ends.
 */
export const toCsv = (rows: readonly TableRow[], year: number): string => {
    const lines = rows.map((row) => [
        row.iso3,
        row.name,
        row.aid,
        row.byProvider.us,
        row.byProvider.globalFund,
        row.byProvider.other,
        row.plhiv,
        row.perPerson === null ? null : Number(row.perPerson.toFixed(2)),
        row.art,
        row.deaths,
    ]);

    return (
        [csvHeader(year), ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
    );
};
