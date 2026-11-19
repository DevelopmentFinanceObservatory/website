// The country table's rows, their sort, and the CSV download of them.
import type { ProviderKey } from '../_data/types.ts';

import { mixPercents, roundDeaths } from './format.ts';
import { aidPerPerson, gfMultiFlag, lastAid, lastShares } from './summary.ts';
import type { UnaidsCountry } from './unaids.ts';

export type TableRow = {
    iso3: string;
    name: string;
    /** last-year HIV aid, all providers, in US dollars */
    aid: number;
    /** last-year HIV aid by provider, in US dollars */
    byProvider: Record<ProviderKey, number>;
    /** each provider's share of `aid`, all 0 where `aid` is 0 */
    shares: Record<ProviderKey, number>;
    /** `shares` as printed: whole percentages summing to 100, "<1%" for a small share above 0 */
    mixPercents: Record<ProviderKey, string>;
    /** last-year Global Fund multi-disease grants under codes 12110 and 12250, in US dollars,
     *  outside `aid` */
    globalFundMulti: number;
    /** the Global Fund gave multi-disease grants in the last year, so the row understates it */
    flagged: boolean;
    plhiv: number | null;
    /** last-year aid per person living with HIV, in US dollars; null under 5,000 people */
    perPerson: number | null;
    /** antiretroviral therapy coverage, in percent */
    art: number | null;
    /** AIDS-related deaths in the last year */
    deaths: number | null;
};

export const tableRows = (countries: readonly UnaidsCountry[]): TableRow[] =>
    countries.map((country) => {
        const shares = lastShares(country.aid);

        return {
            iso3: country.iso3,
            name: country.name,
            aid: lastAid(country),
            byProvider: {
                us: country.aid.us.at(-1) ?? 0,
                globalFund: country.aid.globalFund.at(-1) ?? 0,
                other: country.aid.other.at(-1) ?? 0,
            },
            shares,
            mixPercents: mixPercents(shares),
            globalFundMulti: country.globalFundMulti.at(-1) ?? 0,
            flagged: gfMultiFlag(country),
            plhiv: country.plhiv,
            perPerson: aidPerPerson(country),
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
    `global_fund_multi_${year}_usd`,
    `people_living_with_hiv_${year}`,
    `aid_per_person_${year}_usd`,
    `art_coverage_${year}_pct`,
    `aids_deaths_${year}`,
];

const csvCell = (value: string | number | null): string => {
    const text = value === null ? '' : String(value);

    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** Leads the file so Excel reads it as UTF-8 and keeps "Côte d'Ivoire" intact. */
export const CSV_BOM = '\uFEFF';

/**
 * One line per row, in the order given, after a UTF-8 byte order mark: dollars and people
 * as held, aid per person to the cent, deaths rounded as the table prints them. Global Fund
 * multi-disease grants sit in their own column, outside HIV aid. A missing value is an
 * empty cell. RFC 4180 quoting, CRLF line ends.
 */
export const toCsv = (rows: readonly TableRow[], year: number): string => {
    const lines = rows.map((row) => [
        row.iso3,
        row.name,
        row.aid,
        row.byProvider.us,
        row.byProvider.globalFund,
        row.byProvider.other,
        row.globalFundMulti,
        row.plhiv,
        row.perPerson === null ? null : Number(row.perPerson.toFixed(2)),
        row.art,
        row.deaths === null ? null : roundDeaths(row.deaths),
    ]);

    return (
        CSV_BOM +
        [csvHeader(year), ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n') +
        '\r\n'
    );
};
